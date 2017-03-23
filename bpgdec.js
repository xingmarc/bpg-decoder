module.exports = (function() {
    var Module = {};
    // var Module;
    // if (!Module) Module = (typeof Module !== "undefined" ? Module : null) || {};
    var moduleOverrides = {};
    for (var key in Module) {
        if (Module.hasOwnProperty(key)) {
            moduleOverrides[key] = Module[key]
        }
    }

    Module["read"] = function read(url) {
        var xhr = new XMLHttpRequest;
        xhr.open("GET", url, false);
        xhr.send(null);
        return xhr.responseText
    };
    if (typeof arguments != "undefined") {
        Module["arguments"] = arguments
    }
    if (typeof console !== "undefined") {
        if (!Module["print"]) Module["print"] = function print(x) {
            console.log(x)
        };
        if (!Module["printErr"]) Module["printErr"] = function printErr(x) {
            console.error(x)
        }
    } else {
        var TRY_USE_DUMP = false;
        if (!Module["print"]) Module["print"] = TRY_USE_DUMP && typeof dump !== "undefined" ? (function(x) {
            dump(x)
        }) : (function(x) {})
    }

    function globalEval(x) {
        eval.call(null, x)
    }
    if (!Module["load"] && Module["read"]) {
        Module["load"] = function load(f) {
            globalEval(Module["read"](f))
        }
    }
    if (!Module["print"]) {
        Module["print"] = (function() {})
    }
    if (!Module["printErr"]) {
        Module["printErr"] = Module["print"]
    }
    if (!Module["arguments"]) {
        Module["arguments"] = []
    }
    if (!Module["thisProgram"]) {
        Module["thisProgram"] = "./this.program"
    }
    Module.print = Module["print"];
    Module.printErr = Module["printErr"];
    Module["preRun"] = [];
    Module["postRun"] = [];
    for (var key in moduleOverrides) {
        if (moduleOverrides.hasOwnProperty(key)) {
            Module[key] = moduleOverrides[key]
        }
    }
    var Runtime = {
        setTempRet0: (function(value) {
            tempRet0 = value
        }),
        getTempRet0: (function() {
            return tempRet0
        }),
        stackSave: (function() {
            return STACKTOP
        }),
        stackRestore: (function(stackTop) {
            STACKTOP = stackTop
        }),
        getNativeTypeSize: (function(type) {
            switch (type) {
                case "i1":
                case "i8":
                    return 1;
                case "i16":
                    return 2;
                case "i32":
                    return 4;
                case "i64":
                    return 8;
                case "float":
                    return 4;
                case "double":
                    return 8;
                default:
                    {
                        if (type[type.length - 1] === "*") {
                            return Runtime.QUANTUM_SIZE
                        } else if (type[0] === "i") {
                            var bits = parseInt(type.substr(1));
                            assert(bits % 8 === 0);
                            return bits / 8
                        } else {
                            return 0
                        }
                    }
            }
        }),
        getNativeFieldSize: (function(type) {
            return Math.max(Runtime.getNativeTypeSize(type), Runtime.QUANTUM_SIZE)
        }),
        STACK_ALIGN: 16,
        getAlignSize: (function(type, size, vararg) {
            if (!vararg && (type == "i64" || type == "double")) return 8;
            if (!type) return Math.min(size, 8);
            return Math.min(size || (type ? Runtime.getNativeFieldSize(type) : 0), Runtime.QUANTUM_SIZE)
        }),
        dynCall: (function(sig, ptr, args) {
            if (args && args.length) {
                if (!args.splice) args = Array.prototype.slice.call(args);
                args.splice(0, 0, ptr);
                return Module["dynCall_" + sig].apply(null, args)
            } else {
                return Module["dynCall_" + sig].call(null, ptr)
            }
        }),
        functionPointers: [],
        addFunction: (function(func) {
            for (var i = 0; i < Runtime.functionPointers.length; i++) {
                if (!Runtime.functionPointers[i]) {
                    Runtime.functionPointers[i] = func;
                    return 2 * (1 + i)
                }
            }
            throw "Finished up all reserved function pointers. Use a higher value for RESERVED_FUNCTION_POINTERS."
        }),
        removeFunction: (function(index) {
            Runtime.functionPointers[(index - 2) / 2] = null
        }),
        getAsmConst: (function(code, numArgs) {
            if (!Runtime.asmConstCache) Runtime.asmConstCache = {};
            var func = Runtime.asmConstCache[code];
            if (func) return func;
            var args = [];
            for (var i = 0; i < numArgs; i++) {
                args.push(String.fromCharCode(36) + i)
            }
            var source = Pointer_stringify(code);
            if (source[0] === '"') {
                if (source.indexOf('"', 1) === source.length - 1) {
                    source = source.substr(1, source.length - 2)
                } else {
                    abort("invalid EM_ASM input |" + source + "|. Please use EM_ASM(..code..) (no quotes) or EM_ASM({ ..code($0).. }, input) (to input values)")
                }
            }
            try {
                var evalled = eval("(function(Module, FS) { return function(" + args.join(",") + "){ " + source + " } })")(Module, typeof FS !== "undefined" ? FS : null)
            } catch (e) {
                Module.printErr("error in executing inline EM_ASM code: " + e + " on: \n\n" + source + "\n\nwith args |" + args + "| (make sure to use the right one out of EM_ASM, EM_ASM_ARGS, etc.)");
                throw e
            }
            return Runtime.asmConstCache[code] = evalled
        }),
        warnOnce: (function(text) {
            if (!Runtime.warnOnce.shown) Runtime.warnOnce.shown = {};
            if (!Runtime.warnOnce.shown[text]) {
                Runtime.warnOnce.shown[text] = 1;
                Module.printErr(text)
            }
        }),
        funcWrappers: {},
        getFuncWrapper: (function(func, sig) {
            assert(sig);
            if (!Runtime.funcWrappers[sig]) {
                Runtime.funcWrappers[sig] = {}
            }
            var sigCache = Runtime.funcWrappers[sig];
            if (!sigCache[func]) {
                sigCache[func] = function dynCall_wrapper() {
                    return Runtime.dynCall(sig, func, arguments)
                }
            }
            return sigCache[func]
        }),
        UTF8Processor: (function() {
            var buffer = [];
            var needed = 0;
            this.processCChar = (function(code) {
                code = code & 255;
                if (buffer.length == 0) {
                    if ((code & 128) == 0) {
                        return String.fromCharCode(code)
                    }
                    buffer.push(code);
                    if ((code & 224) == 192) {
                        needed = 1
                    } else if ((code & 240) == 224) {
                        needed = 2
                    } else {
                        needed = 3
                    }
                    return ""
                }
                if (needed) {
                    buffer.push(code);
                    needed--;
                    if (needed > 0) return ""
                }
                var c1 = buffer[0];
                var c2 = buffer[1];
                var c3 = buffer[2];
                var c4 = buffer[3];
                var ret;
                if (buffer.length == 2) {
                    ret = String.fromCharCode((c1 & 31) << 6 | c2 & 63)
                } else if (buffer.length == 3) {
                    ret = String.fromCharCode((c1 & 15) << 12 | (c2 & 63) << 6 | c3 & 63)
                } else {
                    var codePoint = (c1 & 7) << 18 | (c2 & 63) << 12 | (c3 & 63) << 6 | c4 & 63;
                    ret = String.fromCharCode(((codePoint - 65536) / 1024 | 0) + 55296, (codePoint - 65536) % 1024 + 56320)
                }
                buffer.length = 0;
                return ret
            });
            this.processJSString = function processJSString(string) {
                string = unescape(encodeURIComponent(string));
                var ret = [];
                for (var i = 0; i < string.length; i++) {
                    ret.push(string.charCodeAt(i))
                }
                return ret
            }
        }),
        getCompilerSetting: (function(name) {
            throw "You must build with -s RETAIN_COMPILER_SETTINGS=1 for Runtime.getCompilerSetting or emscripten_get_compiler_setting to work"
        }),
        stackAlloc: (function(size) {
            var ret = STACKTOP;
            STACKTOP = STACKTOP + size | 0;
            STACKTOP = STACKTOP + 15 & -16;
            return ret
        }),
        staticAlloc: (function(size) {
            var ret = STATICTOP;
            STATICTOP = STATICTOP + size | 0;
            STATICTOP = STATICTOP + 15 & -16;
            return ret
        }),
        dynamicAlloc: (function(size) {
            var ret = DYNAMICTOP;
            DYNAMICTOP = DYNAMICTOP + size | 0;
            DYNAMICTOP = DYNAMICTOP + 15 & -16;
            if (DYNAMICTOP >= TOTAL_MEMORY) enlargeMemory();
            return ret
        }),
        alignMemory: (function(size, quantum) {
            var ret = size = Math.ceil(size / (quantum ? quantum : 16)) * (quantum ? quantum : 16);
            return ret
        }),
        makeBigInt: (function(low, high, unsigned) {
            var ret = unsigned ? +(low >>> 0) + +(high >>> 0) * +4294967296 : +(low >>> 0) + +(high | 0) * +4294967296;
            return ret
        }),
        GLOBAL_BASE: 8,
        QUANTUM_SIZE: 4,
        __dummy__: 0
    };
    Module["Runtime"] = Runtime;
    var __THREW__ = 0;
    var ABORT = false;
    var EXITSTATUS = 0;
    var undef = 0;
    var tempValue, tempInt, tempBigInt, tempInt2, tempBigInt2, tempPair, tempBigIntI, tempBigIntR, tempBigIntS, tempBigIntP, tempBigIntD, tempDouble, tempFloat;
    var tempI64, tempI64b;
    var tempRet0, tempRet1, tempRet2, tempRet3, tempRet4, tempRet5, tempRet6, tempRet7, tempRet8, tempRet9;

    function assert(condition, text) {
        if (!condition) {
            abort("Assertion failed: " + text)
        }
    }
    var globalScope = this;

    function getCFunc(ident) {
        var func = Module["_" + ident];
        if (!func) {
            try {
                func = eval("_" + ident)
            } catch (e) {}
        }
        assert(func, "Cannot call unknown function " + ident + " (perhaps LLVM optimizations or closure removed it?)");
        return func
    }
    var cwrap, ccall;
    ((function() {
        var stack = 0;
        var JSfuncs = {
            "stackSave": (function() {
                stack = Runtime.stackSave()
            }),
            "stackRestore": (function() {
                Runtime.stackRestore(stack)
            }),
            "arrayToC": (function(arr) {
                var ret = Runtime.stackAlloc(arr.length);
                writeArrayToMemory(arr, ret);
                return ret
            }),
            "stringToC": (function(str) {
                var ret = 0;
                if (str !== null && str !== undefined && str !== 0) {
                    ret = Runtime.stackAlloc((str.length << 2) + 1);
                    writeStringToMemory(str, ret)
                }
                return ret
            })
        };
        var toC = {
            "string": JSfuncs["stringToC"],
            "array": JSfuncs["arrayToC"]
        };
        ccall = function ccallFunc(ident, returnType, argTypes, args) {
            var func = getCFunc(ident);
            var cArgs = [];
            if (args) {
                for (var i = 0; i < args.length; i++) {
                    var converter = toC[argTypes[i]];
                    if (converter) {
                        if (stack === 0) stack = Runtime.stackSave();
                        cArgs[i] = converter(args[i])
                    } else {
                        cArgs[i] = args[i]
                    }
                }
            }
            var ret = func.apply(null, cArgs);
            if (returnType === "string") ret = Pointer_stringify(ret);
            if (stack !== 0) JSfuncs["stackRestore"]();
            return ret
        };
        var sourceRegex = /^function\s*\(([^)]*)\)\s*{\s*([^*]*?)[\s;]*(?:return\s*(.*?)[;\s]*)?}$/;

        function parseJSFunc(jsfunc) {
            var parsed = jsfunc.toString().match(sourceRegex).slice(1);
            return {
                arguments: parsed[0],
                body: parsed[1],
                returnValue: parsed[2]
            }
        }
        var JSsource = {};
        for (var fun in JSfuncs) {
            if (JSfuncs.hasOwnProperty(fun)) {
                JSsource[fun] = parseJSFunc(JSfuncs[fun])
            }
        }
        cwrap = function cwrap(ident, returnType, argTypes) {
            argTypes = argTypes || [];
            var cfunc = getCFunc(ident);
            var numericArgs = argTypes.every((function(type) {
                return type === "number"
            }));
            var numericRet = returnType !== "string";
            if (numericRet && numericArgs) {
                return cfunc
            }
            var argNames = argTypes.map((function(x, i) {
                return "$" + i
            }));
            var funcstr = "(function(" + argNames.join(",") + ") {";
            var nargs = argTypes.length;
            if (!numericArgs) {
                funcstr += JSsource["stackSave"].body + ";";
                for (var i = 0; i < nargs; i++) {
                    var arg = argNames[i],
                        type = argTypes[i];
                    if (type === "number") continue;
                    var convertCode = JSsource[type + "ToC"];
                    funcstr += "var " + convertCode.arguments + " = " + arg + ";";
                    funcstr += convertCode.body + ";";
                    funcstr += arg + "=" + convertCode.returnValue + ";"
                }
            }
            var cfuncname = parseJSFunc((function() {
                return cfunc
            })).returnValue;
            funcstr += "var ret = " + cfuncname + "(" + argNames.join(",") + ");";
            if (!numericRet) {
                var strgfy = parseJSFunc((function() {
                    return Pointer_stringify
                })).returnValue;
                funcstr += "ret = " + strgfy + "(ret);"
            }
            if (!numericArgs) {
                funcstr += JSsource["stackRestore"].body + ";"
            }
            funcstr += "return ret})";
            return eval(funcstr)
        }
    }))();
    Module["cwrap"] = cwrap;
    Module["ccall"] = ccall;

    function setValue(ptr, value, type, noSafe) {
        type = type || "i8";
        if (type.charAt(type.length - 1) === "*") type = "i32";
        switch (type) {
            case "i1":
                HEAP8[ptr >> 0] = value;
                break;
            case "i8":
                HEAP8[ptr >> 0] = value;
                break;
            case "i16":
                HEAP16[ptr >> 1] = value;
                break;
            case "i32":
                HEAP32[ptr >> 2] = value;
                break;
            case "i64":
                tempI64 = [value >>> 0, (tempDouble = value, +Math_abs(tempDouble) >= +1 ? tempDouble > +0 ? (Math_min(+Math_floor(tempDouble / +4294967296), +4294967295) | 0) >>> 0 : ~~+Math_ceil((tempDouble - +(~~tempDouble >>> 0)) / +4294967296) >>> 0 : 0)], HEAP32[ptr >> 2] = tempI64[0], HEAP32[ptr + 4 >> 2] = tempI64[1];
                break;
            case "float":
                HEAPF32[ptr >> 2] = value;
                break;
            case "double":
                HEAPF64[ptr >> 3] = value;
                break;
            default:
                abort("invalid type for setValue: " + type)
        }
    }
    Module["setValue"] = setValue;

    function getValue(ptr, type, noSafe) {
        type = type || "i8";
        if (type.charAt(type.length - 1) === "*") type = "i32";
        switch (type) {
            case "i1":
                return HEAP8[ptr >> 0];
            case "i8":
                return HEAP8[ptr >> 0];
            case "i16":
                return HEAP16[ptr >> 1];
            case "i32":
                return HEAP32[ptr >> 2];
            case "i64":
                return HEAP32[ptr >> 2];
            case "float":
                return HEAPF32[ptr >> 2];
            case "double":
                return HEAPF64[ptr >> 3];
            default:
                abort("invalid type for setValue: " + type)
        }
        return null
    }
    Module["getValue"] = getValue;
    var ALLOC_NORMAL = 0;
    var ALLOC_STACK = 1;
    var ALLOC_STATIC = 2;
    var ALLOC_DYNAMIC = 3;
    var ALLOC_NONE = 4;
    Module["ALLOC_NORMAL"] = ALLOC_NORMAL;
    Module["ALLOC_STACK"] = ALLOC_STACK;
    Module["ALLOC_STATIC"] = ALLOC_STATIC;
    Module["ALLOC_DYNAMIC"] = ALLOC_DYNAMIC;
    Module["ALLOC_NONE"] = ALLOC_NONE;

    function allocate(slab, types, allocator, ptr) {
        var zeroinit, size;
        if (typeof slab === "number") {
            zeroinit = true;
            size = slab
        } else {
            zeroinit = false;
            size = slab.length
        }
        var singleType = typeof types === "string" ? types : null;
        var ret;
        if (allocator == ALLOC_NONE) {
            ret = ptr
        } else {
            ret = [_malloc, Runtime.stackAlloc, Runtime.staticAlloc, Runtime.dynamicAlloc][allocator === undefined ? ALLOC_STATIC : allocator](Math.max(size, singleType ? 1 : types.length))
        }
        if (zeroinit) {
            var ptr = ret,
                stop;
            assert((ret & 3) == 0);
            stop = ret + (size & ~3);
            for (; ptr < stop; ptr += 4) {
                HEAP32[ptr >> 2] = 0
            }
            stop = ret + size;
            while (ptr < stop) {
                HEAP8[ptr++ >> 0] = 0
            }
            return ret
        }
        if (singleType === "i8") {
            if (slab.subarray || slab.slice) {
                HEAPU8.set(slab, ret)
            } else {
                HEAPU8.set(new Uint8Array(slab), ret)
            }
            return ret
        }
        var i = 0,
            type, typeSize, previousType;
        while (i < size) {
            var curr = slab[i];
            if (typeof curr === "function") {
                curr = Runtime.getFunctionIndex(curr)
            }
            type = singleType || types[i];
            if (type === 0) {
                i++;
                continue
            }
            if (type == "i64") type = "i32";
            setValue(ret + i, curr, type);
            if (previousType !== type) {
                typeSize = Runtime.getNativeTypeSize(type);
                previousType = type
            }
            i += typeSize
        }
        return ret
    }
    Module["allocate"] = allocate;

    function demangleAll(text) {
        return text
    }

    function jsStackTrace() {
        var err = new Error;
        if (!err.stack) {
            try {
                throw new Error(0)
            } catch (e) {
                err = e
            }
            if (!err.stack) {
                return "(no stack trace available)"
            }
        }
        return err.stack.toString()
    }

    function stackTrace() {
        return demangleAll(jsStackTrace())
    }
    Module["stackTrace"] = stackTrace;
    var PAGE_SIZE = 4096;

    function alignMemoryPage(x) {
        return x + 4095 & -4096
    }
    var HEAP;
    var HEAP8, HEAPU8, HEAP16, HEAPU16, HEAP32, HEAPU32, HEAPF32, HEAPF64;
    var STATIC_BASE = 0,
        STATICTOP = 0,
        staticSealed = false;
    var STACK_BASE = 0,
        STACKTOP = 0,
        STACK_MAX = 0;
    var DYNAMIC_BASE = 0,
        DYNAMICTOP = 0;

    function enlargeMemory() {
        abort("Cannot enlarge memory arrays. Either (1) compile with -s TOTAL_MEMORY=X with X higher than the current value " + TOTAL_MEMORY + ", (2) compile with ALLOW_MEMORY_GROWTH which adjusts the size at runtime but prevents some optimizations, or (3) set Module.TOTAL_MEMORY before the program runs.")
    }
    var TOTAL_STACK = Module["TOTAL_STACK"] || 5242880;
    var TOTAL_MEMORY = Module["TOTAL_MEMORY"] || 33554432;
    var FAST_MEMORY = Module["FAST_MEMORY"] || 2097152;
    var totalMemory = 64 * 1024;
    while (totalMemory < TOTAL_MEMORY || totalMemory < 2 * TOTAL_STACK) {
        if (totalMemory < 16 * 1024 * 1024) {
            totalMemory *= 2
        } else {
            totalMemory += 16 * 1024 * 1024
        }
    }
    if (totalMemory !== TOTAL_MEMORY) {
        Module.printErr("increasing TOTAL_MEMORY to " + totalMemory + " to be compliant with the asm.js spec");
        TOTAL_MEMORY = totalMemory
    }
    assert(typeof Int32Array !== "undefined" && typeof Float64Array !== "undefined" && !!(new Int32Array(1))["subarray"] && !!(new Int32Array(1))["set"], "JS engine does not provide full typed array support");
    var buffer = new ArrayBuffer(TOTAL_MEMORY);
    HEAP8 = new Int8Array(buffer);
    HEAP16 = new Int16Array(buffer);
    HEAP32 = new Int32Array(buffer);
    HEAPU8 = new Uint8Array(buffer);
    HEAPU16 = new Uint16Array(buffer);
    HEAPU32 = new Uint32Array(buffer);
    HEAPF32 = new Float32Array(buffer);
    HEAPF64 = new Float64Array(buffer);
    HEAP32[0] = 255;
    assert(HEAPU8[0] === 255 && HEAPU8[3] === 0, "Typed arrays 2 must be run on a little-endian system");
    Module["HEAP"] = HEAP;
    Module["buffer"] = buffer;
    Module["HEAP8"] = HEAP8;
    Module["HEAP16"] = HEAP16;
    Module["HEAP32"] = HEAP32;
    Module["HEAPU8"] = HEAPU8;
    Module["HEAPU16"] = HEAPU16;
    Module["HEAPU32"] = HEAPU32;
    Module["HEAPF32"] = HEAPF32;
    Module["HEAPF64"] = HEAPF64;

    function callRuntimeCallbacks(callbacks) {
        while (callbacks.length > 0) {
            var callback = callbacks.shift();
            if (typeof callback == "function") {
                callback();
                continue
            }
            var func = callback.func;
            if (typeof func === "number") {
                if (callback.arg === undefined) {
                    Runtime.dynCall("v", func)
                } else {
                    Runtime.dynCall("vi", func, [callback.arg])
                }
            } else {
                func(callback.arg === undefined ? null : callback.arg)
            }
        }
    }
    var __ATPRERUN__ = [];
    var __ATINIT__ = [];
    var __ATMAIN__ = [];
    var __ATEXIT__ = [];
    var __ATPOSTRUN__ = [];
    var runtimeInitialized = false;
    var runtimeExited = false;

    function preRun() {
        if (Module["preRun"]) {
            if (typeof Module["preRun"] == "function") Module["preRun"] = [Module["preRun"]];
            while (Module["preRun"].length) {
                addOnPreRun(Module["preRun"].shift())
            }
        }
        callRuntimeCallbacks(__ATPRERUN__)
    }

    function ensureInitRuntime() {
        if (runtimeInitialized) return;
        runtimeInitialized = true;
        callRuntimeCallbacks(__ATINIT__)
    }

    function preMain() {
        callRuntimeCallbacks(__ATMAIN__)
    }

    function exitRuntime() {
        callRuntimeCallbacks(__ATEXIT__);
        runtimeExited = true
    }

    function postRun() {
        if (Module["postRun"]) {
            if (typeof Module["postRun"] == "function") Module["postRun"] = [Module["postRun"]];
            while (Module["postRun"].length) {
                addOnPostRun(Module["postRun"].shift())
            }
        }
        callRuntimeCallbacks(__ATPOSTRUN__)
    }

    function addOnPreRun(cb) {
        __ATPRERUN__.unshift(cb)
    }
    Module["addOnPreRun"] = Module.addOnPreRun = addOnPreRun;

    function addOnInit(cb) {
        __ATINIT__.unshift(cb)
    }
    Module["addOnInit"] = Module.addOnInit = addOnInit;

    function addOnPreMain(cb) {
        __ATMAIN__.unshift(cb)
    }
    Module["addOnPreMain"] = Module.addOnPreMain = addOnPreMain;

    function addOnExit(cb) {
        __ATEXIT__.unshift(cb)
    }
    Module["addOnExit"] = Module.addOnExit = addOnExit;

    function addOnPostRun(cb) {
        __ATPOSTRUN__.unshift(cb)
    }
    Module["addOnPostRun"] = Module.addOnPostRun = addOnPostRun;

    function intArrayFromString(stringy, dontAddNull, length) {
        var ret = (new Runtime.UTF8Processor).processJSString(stringy);
        if (length) {
            ret.length = length
        }
        if (!dontAddNull) {
            ret.push(0)
        }
        return ret
    }
    Module["intArrayFromString"] = intArrayFromString;

    function intArrayToString(array) {
        var ret = [];
        for (var i = 0; i < array.length; i++) {
            var chr = array[i];
            if (chr > 255) {
                chr &= 255
            }
            ret.push(String.fromCharCode(chr))
        }
        return ret.join("")
    }
    Module["intArrayToString"] = intArrayToString;

    function writeStringToMemory(string, buffer, dontAddNull) {
        var array = intArrayFromString(string, dontAddNull);
        var i = 0;
        while (i < array.length) {
            var chr = array[i];
            HEAP8[buffer + i >> 0] = chr;
            i = i + 1
        }
    }
    Module["writeStringToMemory"] = writeStringToMemory;

    function writeArrayToMemory(array, buffer) {
        for (var i = 0; i < array.length; i++) {
            HEAP8[buffer + i >> 0] = array[i]
        }
    }
    Module["writeArrayToMemory"] = writeArrayToMemory;

    function writeAsciiToMemory(str, buffer, dontAddNull) {
        for (var i = 0; i < str.length; i++) {
            HEAP8[buffer + i >> 0] = str.charCodeAt(i)
        }
        if (!dontAddNull) HEAP8[buffer + str.length >> 0] = 0
    }
    Module["writeAsciiToMemory"] = writeAsciiToMemory;

    function unSign(value, bits, ignore) {
        if (value >= 0) {
            return value
        }
        return bits <= 32 ? 2 * Math.abs(1 << bits - 1) + value : Math.pow(2, bits) + value
    }

    function reSign(value, bits, ignore) {
        if (value <= 0) {
            return value
        }
        var half = bits <= 32 ? Math.abs(1 << bits - 1) : Math.pow(2, bits - 1);
        if (value >= half && (bits <= 32 || value > half)) {
            value = -2 * half + value
        }
        return value
    }
    if (!Math["imul"] || Math["imul"](4294967295, 5) !== -5) Math["imul"] = function imul(a, b) {
        var ah = a >>> 16;
        var al = a & 65535;
        var bh = b >>> 16;
        var bl = b & 65535;
        return al * bl + (ah * bl + al * bh << 16) | 0
    };
    Math.imul = Math["imul"];
    var Math_abs = Math.abs;
    var Math_cos = Math.cos;
    var Math_sin = Math.sin;
    var Math_tan = Math.tan;
    var Math_acos = Math.acos;
    var Math_asin = Math.asin;
    var Math_atan = Math.atan;
    var Math_atan2 = Math.atan2;
    var Math_exp = Math.exp;
    var Math_log = Math.log;
    var Math_sqrt = Math.sqrt;
    var Math_ceil = Math.ceil;
    var Math_floor = Math.floor;
    var Math_pow = Math.pow;
    var Math_imul = Math.imul;
    var Math_fround = Math.fround;
    var Math_min = Math.min;
    var runDependencies = 0;
    var runDependencyWatcher = null;
    var dependenciesFulfilled = null;

    function addRunDependency(id) {
        runDependencies++;
        if (Module["monitorRunDependencies"]) {
            Module["monitorRunDependencies"](runDependencies)
        }
    }
    Module["addRunDependency"] = addRunDependency;

    function removeRunDependency(id) {
        runDependencies--;
        if (Module["monitorRunDependencies"]) {
            Module["monitorRunDependencies"](runDependencies)
        }
        if (runDependencies == 0) {
            if (runDependencyWatcher !== null) {
                clearInterval(runDependencyWatcher);
                runDependencyWatcher = null
            }
            if (dependenciesFulfilled) {
                var callback = dependenciesFulfilled;
                dependenciesFulfilled = null;
                callback()
            }
        }
    }
    Module["removeRunDependency"] = removeRunDependency;
    Module["preloadedImages"] = {};
    Module["preloadedAudios"] = {};
    var memoryInitializer = null;
    STATIC_BASE = 8;
    STATICTOP = STATIC_BASE + 6112;
    __ATINIT__.push();
    allocate([0, 0, 1, 0, 1, 2, 0, 1, 2, 3, 1, 2, 3, 2, 3, 3, 0, 1, 0, 2, 1, 0, 3, 2, 1, 0, 3, 2, 1, 3, 2, 3, 0, 0, 1, 0, 1, 2, 0, 1, 2, 3, 0, 1, 2, 3, 4, 0, 1, 2, 3, 4, 5, 0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4, 5, 6, 7, 1, 2, 3, 4, 5, 6, 7, 2, 3, 4, 5, 6, 7, 3, 4, 5, 6, 7, 4, 5, 6, 7, 5, 6, 7, 6, 7, 7, 0, 1, 0, 2, 1, 0, 3, 2, 1, 0, 4, 3, 2, 1, 0, 5, 4, 3, 2, 1, 0, 6, 5, 4, 3, 2, 1, 0, 7, 6, 5, 4, 3, 2, 1, 0, 7, 6, 5, 4, 3, 2, 1, 7, 6, 5, 4, 3, 2, 7, 6, 5, 4, 3, 7, 6, 5, 4, 7, 6, 5, 7, 6, 7, 40, 45, 51, 57, 64, 72, 0, 0, 29, 0, 0, 0, 30, 0, 0, 0, 31, 0, 0, 0, 32, 0, 0, 0, 33, 0, 0, 0, 33, 0, 0, 0, 34, 0, 0, 0, 34, 0, 0, 0, 35, 0, 0, 0, 35, 0, 0, 0, 36, 0, 0, 0, 36, 0, 0, 0, 37, 0, 0, 0, 37, 0, 0, 0, 0, 1, 2, 3, 4, 5, 0, 1, 2, 3, 4, 5, 0, 1, 2, 3, 4, 5, 0, 1, 2, 3, 4, 5, 0, 1, 2, 3, 4, 5, 0, 1, 2, 3, 4, 5, 0, 1, 2, 3, 4, 5, 0, 1, 2, 3, 4, 5, 0, 1, 2, 3, 4, 5, 0, 1, 2, 3, 4, 5, 0, 1, 2, 3, 4, 5, 0, 1, 2, 3, 4, 5, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 6, 7, 7, 7, 7, 7, 7, 8, 8, 8, 8, 8, 8, 9, 9, 9, 9, 9, 9, 10, 10, 10, 10, 10, 10, 11, 11, 11, 11, 11, 11, 12, 12, 0, 0, 0, 0, 0, 0, 0, 2, 5, 9, 1, 4, 8, 12, 3, 7, 11, 14, 6, 10, 13, 15, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 1, 3, 0, 0, 0, 0, 0, 2, 5, 9, 14, 20, 27, 35, 1, 4, 8, 13, 19, 26, 34, 42, 3, 7, 12, 18, 25, 33, 41, 48, 6, 11, 17, 24, 32, 40, 47, 53, 10, 16, 23, 31, 39, 46, 52, 57, 15, 22, 30, 38, 45, 51, 56, 60, 21, 29, 37, 44, 50, 55, 59, 62, 28, 36, 43, 49, 54, 58, 61, 63, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 0, 1, 2, 3, 16, 17, 18, 19, 4, 5, 6, 7, 20, 21, 22, 23, 8, 9, 10, 11, 24, 25, 26, 27, 12, 13, 14, 15, 28, 29, 30, 31, 32, 33, 34, 35, 48, 49, 50, 51, 36, 37, 38, 39, 52, 53, 54, 55, 40, 41, 42, 43, 56, 57, 58, 59, 44, 45, 46, 47, 60, 61, 62, 63, 0, 1, 4, 5, 2, 3, 4, 5, 6, 6, 8, 8, 7, 7, 8, 8, 1, 1, 1, 0, 1, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 2, 2, 2, 2, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 2, 1, 0, 0, 2, 1, 0, 0, 2, 1, 0, 0, 2, 1, 0, 0, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 153, 200, 139, 141, 157, 154, 154, 154, 154, 154, 154, 154, 154, 184, 154, 154, 154, 184, 63, 139, 154, 154, 154, 154, 154, 154, 154, 154, 154, 154, 154, 154, 154, 154, 154, 154, 154, 153, 138, 138, 111, 141, 94, 138, 182, 154, 139, 139, 139, 139, 139, 139, 110, 110, 124, 125, 140, 153, 125, 127, 140, 109, 111, 143, 127, 111, 79, 108, 123, 63, 110, 110, 124, 125, 140, 153, 125, 127, 140, 109, 111, 143, 127, 111, 79, 108, 123, 63, 91, 171, 134, 141, 111, 111, 125, 110, 110, 94, 124, 108, 124, 107, 125, 141, 179, 153, 125, 107, 125, 141, 179, 153, 125, 107, 125, 141, 179, 153, 125, 140, 139, 182, 182, 152, 136, 152, 136, 153, 136, 139, 111, 136, 139, 111, 141, 111, 140, 92, 137, 138, 140, 152, 138, 139, 153, 74, 149, 92, 139, 107, 122, 152, 140, 179, 166, 182, 140, 227, 122, 197, 138, 153, 136, 167, 152, 152, 154, 154, 154, 154, 154, 154, 154, 154, 154, 154, 154, 154, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 153, 185, 107, 139, 126, 154, 197, 185, 201, 154, 154, 154, 149, 154, 139, 154, 154, 154, 152, 139, 110, 122, 95, 79, 63, 31, 31, 153, 153, 153, 153, 140, 198, 140, 198, 168, 79, 124, 138, 94, 153, 111, 149, 107, 167, 154, 139, 139, 139, 139, 139, 139, 125, 110, 94, 110, 95, 79, 125, 111, 110, 78, 110, 111, 111, 95, 94, 108, 123, 108, 125, 110, 94, 110, 95, 79, 125, 111, 110, 78, 110, 111, 111, 95, 94, 108, 123, 108, 121, 140, 61, 154, 155, 154, 139, 153, 139, 123, 123, 63, 153, 166, 183, 140, 136, 153, 154, 166, 183, 140, 136, 153, 154, 166, 183, 140, 136, 153, 154, 170, 153, 123, 123, 107, 121, 107, 121, 167, 151, 183, 140, 151, 183, 140, 140, 140, 154, 196, 196, 167, 154, 152, 167, 182, 182, 134, 149, 136, 153, 121, 136, 137, 169, 194, 166, 167, 154, 167, 137, 182, 107, 167, 91, 122, 107, 167, 154, 154, 154, 154, 154, 154, 154, 154, 154, 154, 154, 154, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 153, 160, 107, 139, 126, 154, 197, 185, 201, 154, 154, 154, 134, 154, 139, 154, 154, 183, 152, 139, 154, 137, 95, 79, 63, 31, 31, 153, 153, 153, 153, 169, 198, 169, 198, 168, 79, 224, 167, 122, 153, 111, 149, 92, 167, 154, 139, 139, 139, 139, 139, 139, 125, 110, 124, 110, 95, 94, 125, 111, 111, 79, 125, 126, 111, 111, 79, 108, 123, 93, 125, 110, 124, 110, 95, 94, 125, 111, 111, 79, 125, 126, 111, 111, 79, 108, 123, 93, 121, 140, 61, 154, 170, 154, 139, 153, 139, 123, 123, 63, 124, 166, 183, 140, 136, 153, 154, 166, 183, 140, 136, 153, 154, 166, 183, 140, 136, 153, 154, 170, 153, 138, 138, 122, 121, 122, 121, 167, 151, 183, 140, 151, 183, 140, 140, 140, 154, 196, 167, 167, 154, 152, 167, 182, 182, 134, 149, 136, 153, 121, 136, 122, 169, 208, 166, 167, 154, 152, 167, 182, 107, 167, 91, 107, 107, 167, 154, 154, 154, 154, 154, 154, 154, 154, 154, 154, 154, 154, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 46, 48, 50, 52, 54, 56, 58, 60, 62, 64, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 5, 5, 6, 6, 7, 8, 9, 10, 11, 13, 14, 16, 18, 20, 22, 24, 0, 0, 29, 30, 31, 32, 33, 33, 34, 34, 35, 35, 36, 36, 37, 37, 0, 0, 104, 101, 118, 99, 0, 0, 0, 0, 128, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 53, 54, 50, 72, 34, 48, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 176, 17, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 26, 10, 1, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 3, 5, 7, 8, 10, 12, 13, 15, 17, 18, 19, 20, 21, 22, 23, 23, 24, 24, 25, 25, 26, 27, 27, 28, 28, 29, 29, 30, 31, 0, 0, 0, 0, 0, 7, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 32, 26, 21, 17, 13, 9, 5, 2, 0, 254, 251, 247, 243, 239, 235, 230, 224, 230, 235, 239, 243, 247, 251, 254, 0, 2, 5, 9, 13, 17, 21, 26, 32, 0, 0, 0, 0, 0, 0, 0, 0, 240, 154, 249, 114, 252, 138, 253, 30, 254, 122, 254, 197, 254, 0, 255, 197, 254, 122, 254, 30, 254, 138, 253, 114, 252, 154, 249, 0, 240, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 64, 90, 90, 90, 89, 88, 87, 85, 83, 82, 80, 78, 75, 73, 70, 67, 64, 61, 57, 54, 50, 46, 43, 38, 36, 31, 25, 22, 18, 13, 9, 4, 1, 2, 0, 3, 4, 0, 0, 0, 255, 0, 1, 0, 0, 255, 0, 1, 255, 255, 1, 1, 1, 255, 255, 1, 16, 16, 16, 16, 17, 18, 21, 24, 16, 16, 16, 16, 17, 19, 22, 25, 16, 16, 17, 18, 20, 22, 25, 29, 16, 16, 18, 21, 24, 27, 31, 36, 17, 17, 20, 24, 30, 35, 41, 47, 18, 19, 22, 27, 35, 44, 54, 65, 21, 22, 25, 31, 41, 54, 70, 88, 24, 25, 29, 36, 47, 65, 88, 115, 16, 16, 16, 16, 17, 18, 20, 24, 16, 16, 16, 17, 18, 20, 24, 25, 16, 16, 17, 18, 20, 24, 25, 28, 16, 17, 18, 20, 24, 25, 28, 33, 17, 18, 20, 24, 25, 28, 33, 41, 18, 20, 24, 25, 28, 33, 41, 54, 20, 24, 25, 28, 33, 41, 54, 71, 24, 25, 28, 33, 41, 54, 71, 91, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 128, 176, 208, 240, 128, 167, 197, 227, 128, 158, 187, 216, 123, 150, 178, 205, 116, 142, 169, 195, 111, 135, 160, 185, 105, 128, 152, 175, 100, 122, 144, 166, 95, 116, 137, 158, 90, 110, 130, 150, 85, 104, 123, 142, 81, 99, 117, 135, 77, 94, 111, 128, 73, 89, 105, 122, 69, 85, 100, 116, 66, 80, 95, 110, 62, 76, 90, 104, 59, 72, 86, 99, 56, 69, 81, 94, 53, 65, 77, 89, 51, 62, 73, 85, 48, 59, 69, 80, 46, 56, 66, 76, 43, 53, 63, 72, 41, 50, 59, 69, 39, 48, 56, 65, 37, 45, 54, 62, 35, 43, 51, 59, 33, 41, 48, 56, 32, 39, 46, 53, 30, 37, 43, 50, 29, 35, 41, 48, 27, 33, 39, 45, 26, 31, 37, 43, 24, 30, 35, 41, 23, 28, 33, 39, 22, 27, 32, 37, 21, 26, 30, 35, 20, 24, 29, 33, 19, 23, 27, 31, 18, 22, 26, 30, 17, 21, 25, 28, 16, 20, 23, 27, 15, 19, 22, 25, 14, 18, 21, 24, 14, 17, 20, 23, 13, 16, 19, 22, 12, 15, 18, 21, 12, 14, 17, 20, 11, 14, 16, 19, 11, 13, 15, 18, 10, 12, 15, 17, 10, 12, 14, 16, 9, 11, 13, 15, 9, 11, 12, 14, 8, 10, 12, 14, 8, 9, 11, 13, 7, 9, 11, 12, 7, 9, 10, 12, 7, 8, 10, 11, 6, 8, 9, 11, 6, 7, 9, 10, 6, 7, 8, 9, 2, 2, 2, 2, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 62, 63, 0, 0, 1, 2, 2, 4, 4, 5, 6, 7, 8, 9, 9, 11, 11, 12, 13, 13, 15, 15, 16, 16, 18, 18, 19, 19, 21, 21, 22, 22, 23, 24, 24, 25, 26, 26, 27, 27, 28, 29, 29, 30, 30, 30, 31, 32, 32, 33, 33, 33, 34, 34, 35, 35, 35, 36, 36, 36, 37, 37, 37, 38, 38, 63, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6, 7, 7, 7, 7, 8, 8, 8, 0, 255, 255, 255, 127, 0, 0, 0, 0, 0, 0, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 54, 0, 0, 0, 0, 0, 0, 0, 3, 1, 1, 0, 36, 120, 37, 120, 38, 120, 0, 0, 0, 0, 0, 0, 56, 0, 0, 0, 0, 0, 0, 0, 3, 1, 0, 16, 36, 120, 37, 120, 38, 120, 0, 0, 0, 0, 0, 0, 58, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 16, 36, 120, 37, 120, 38, 120, 0, 0, 0, 0, 0, 0, 32, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 36, 120, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 3, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], "i8", ALLOC_NONE, Runtime.GLOBAL_BASE);
    var tempDoublePtr = Runtime.alignMemory(allocate(12, "i8", ALLOC_STATIC), 8);
    assert(tempDoublePtr % 8 == 0);

    function copyTempFloat(ptr) {
        HEAP8[tempDoublePtr] = HEAP8[ptr];
        HEAP8[tempDoublePtr + 1] = HEAP8[ptr + 1];
        HEAP8[tempDoublePtr + 2] = HEAP8[ptr + 2];
        HEAP8[tempDoublePtr + 3] = HEAP8[ptr + 3]
    }

    function copyTempDouble(ptr) {
        HEAP8[tempDoublePtr] = HEAP8[ptr];
        HEAP8[tempDoublePtr + 1] = HEAP8[ptr + 1];
        HEAP8[tempDoublePtr + 2] = HEAP8[ptr + 2];
        HEAP8[tempDoublePtr + 3] = HEAP8[ptr + 3];
        HEAP8[tempDoublePtr + 4] = HEAP8[ptr + 4];
        HEAP8[tempDoublePtr + 5] = HEAP8[ptr + 5];
        HEAP8[tempDoublePtr + 6] = HEAP8[ptr + 6];
        HEAP8[tempDoublePtr + 7] = HEAP8[ptr + 7]
    }
    Module["_bitshift64Ashr"] = _bitshift64Ashr;
    Module["_i64Subtract"] = _i64Subtract;

    function _sbrk(bytes) {
        var self = _sbrk;
        if (!self.called) {
            DYNAMICTOP = alignMemoryPage(DYNAMICTOP);
            self.called = true;
            assert(Runtime.dynamicAlloc);
            self.alloc = Runtime.dynamicAlloc;
            Runtime.dynamicAlloc = (function() {
                abort("cannot dynamically allocate, sbrk now has control")
            })
        }
        var ret = DYNAMICTOP;
        if (bytes != 0) self.alloc(bytes);
        return ret
    }
    Module["_i64Add"] = _i64Add;
    Module["_strlen"] = _strlen;
    Module["_memset"] = _memset;
    Module["_bitshift64Shl"] = _bitshift64Shl;

    function _abort() {
        Module["abort"]()
    }
    Module["_llvm_bswap_i32"] = _llvm_bswap_i32;

    function _rint(x) {
        if (Math.abs(x % 1) !== .5) return Math.round(x);
        return x + x % 2 + (x < 0 ? 1 : -1)
    }

    function _lrint() {
        return _rint.apply(null, arguments)
    }

    function _emscripten_memcpy_big(dest, src, num) {
        HEAPU8.set(HEAPU8.subarray(src, src + num), dest);
        return dest
    }
    Module["_memcpy"] = _memcpy;
    STACK_BASE = STACKTOP = Runtime.alignMemory(STATICTOP);
    staticSealed = true;
    STACK_MAX = STACK_BASE + TOTAL_STACK;
    DYNAMIC_BASE = DYNAMICTOP = Runtime.alignMemory(STACK_MAX);
    assert(DYNAMIC_BASE < TOTAL_MEMORY, "TOTAL_MEMORY not big enough for stack");
    var ctlz_i8 = allocate([8, 7, 6, 6, 5, 5, 5, 5, 4, 4, 4, 4, 4, 4, 4, 4, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], "i8", ALLOC_DYNAMIC);
    var cttz_i8 = allocate([8, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0, 4, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0, 5, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0, 4, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0, 6, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0, 4, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0, 5, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0, 4, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0, 7, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0, 4, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0, 5, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0, 4, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0, 6, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0, 4, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0, 5, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0, 4, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1, 0], "i8", ALLOC_DYNAMIC);

    function invoke_iiii(index, a1, a2, a3) {
        try {
            return Module["dynCall_iiii"](index, a1, a2, a3)
        } catch (e) {
            if (typeof e !== "number" && e !== "longjmp") throw e;
            asm["setThrew"](1, 0)
        }
    }

    function invoke_viiiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10) {
        try {
            Module["dynCall_viiiiiiiiii"](index, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10)
        } catch (e) {
            if (typeof e !== "number" && e !== "longjmp") throw e;
            asm["setThrew"](1, 0)
        }
    }

    function invoke_viiiiiii(index, a1, a2, a3, a4, a5, a6, a7) {
        try {
            Module["dynCall_viiiiiii"](index, a1, a2, a3, a4, a5, a6, a7)
        } catch (e) {
            if (typeof e !== "number" && e !== "longjmp") throw e;
            asm["setThrew"](1, 0)
        }
    }

    function invoke_viiiiiiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11, a12, a13) {
        try {
            Module["dynCall_viiiiiiiiiiiii"](index, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11, a12, a13)
        } catch (e) {
            if (typeof e !== "number" && e !== "longjmp") throw e;
            asm["setThrew"](1, 0)
        }
    }

    function invoke_vi(index, a1) {
        try {
            Module["dynCall_vi"](index, a1)
        } catch (e) {
            if (typeof e !== "number" && e !== "longjmp") throw e;
            asm["setThrew"](1, 0)
        }
    }

    function invoke_vii(index, a1, a2) {
        try {
            Module["dynCall_vii"](index, a1, a2)
        } catch (e) {
            if (typeof e !== "number" && e !== "longjmp") throw e;
            asm["setThrew"](1, 0)
        }
    }

    function invoke_iiiiiii(index, a1, a2, a3, a4, a5, a6) {
        try {
            return Module["dynCall_iiiiiii"](index, a1, a2, a3, a4, a5, a6)
        } catch (e) {
            if (typeof e !== "number" && e !== "longjmp") throw e;
            asm["setThrew"](1, 0)
        }
    }

    function invoke_ii(index, a1) {
        try {
            return Module["dynCall_ii"](index, a1)
        } catch (e) {
            if (typeof e !== "number" && e !== "longjmp") throw e;
            asm["setThrew"](1, 0)
        }
    }

    function invoke_viii(index, a1, a2, a3) {
        try {
            Module["dynCall_viii"](index, a1, a2, a3)
        } catch (e) {
            if (typeof e !== "number" && e !== "longjmp") throw e;
            asm["setThrew"](1, 0)
        }
    }

    function invoke_iiiii(index, a1, a2, a3, a4) {
        try {
            return Module["dynCall_iiiii"](index, a1, a2, a3, a4)
        } catch (e) {
            if (typeof e !== "number" && e !== "longjmp") throw e;
            asm["setThrew"](1, 0)
        }
    }

    function invoke_viiiiii(index, a1, a2, a3, a4, a5, a6) {
        try {
            Module["dynCall_viiiiii"](index, a1, a2, a3, a4, a5, a6)
        } catch (e) {
            if (typeof e !== "number" && e !== "longjmp") throw e;
            asm["setThrew"](1, 0)
        }
    }

    function invoke_iii(index, a1, a2) {
        try {
            return Module["dynCall_iii"](index, a1, a2)
        } catch (e) {
            if (typeof e !== "number" && e !== "longjmp") throw e;
            asm["setThrew"](1, 0)
        }
    }

    function invoke_iiiiii(index, a1, a2, a3, a4, a5) {
        try {
            return Module["dynCall_iiiiii"](index, a1, a2, a3, a4, a5)
        } catch (e) {
            if (typeof e !== "number" && e !== "longjmp") throw e;
            asm["setThrew"](1, 0)
        }
    }

    function invoke_viiii(index, a1, a2, a3, a4) {
        try {
            Module["dynCall_viiii"](index, a1, a2, a3, a4)
        } catch (e) {
            if (typeof e !== "number" && e !== "longjmp") throw e;
            asm["setThrew"](1, 0)
        }
    }
    Module.asmGlobalArg = {
        "Math": Math,
        "Int8Array": Int8Array,
        "Int16Array": Int16Array,
        "Int32Array": Int32Array,
        "Uint8Array": Uint8Array,
        "Uint16Array": Uint16Array,
        "Uint32Array": Uint32Array,
        "Float32Array": Float32Array,
        "Float64Array": Float64Array
    };
    Module.asmLibraryArg = {
        "abort": abort,
        "assert": assert,
        "min": Math_min,
        "invoke_iiii": invoke_iiii,
        "invoke_viiiiiiiiii": invoke_viiiiiiiiii,
        "invoke_viiiiiii": invoke_viiiiiii,
        "invoke_viiiiiiiiiiiii": invoke_viiiiiiiiiiiii,
        "invoke_vi": invoke_vi,
        "invoke_vii": invoke_vii,
        "invoke_iiiiiii": invoke_iiiiiii,
        "invoke_ii": invoke_ii,
        "invoke_viii": invoke_viii,
        "invoke_iiiii": invoke_iiiii,
        "invoke_viiiiii": invoke_viiiiii,
        "invoke_iii": invoke_iii,
        "invoke_iiiiii": invoke_iiiiii,
        "invoke_viiii": invoke_viiii,
        "_sbrk": _sbrk,
        "_lrint": _lrint,
        "_abort": _abort,
        "_emscripten_memcpy_big": _emscripten_memcpy_big,
        "_rint": _rint,
        "STACKTOP": STACKTOP,
        "STACK_MAX": STACK_MAX,
        "tempDoublePtr": tempDoublePtr,
        "ABORT": ABORT,
        "cttz_i8": cttz_i8,
        "ctlz_i8": ctlz_i8,
        "NaN": NaN,
        "Infinity": Infinity
    }; // EMSCRIPTEN_START_ASM
    var asm = (function(global, env, buffer) {
        "use asm";
        var a = new global.Int8Array(buffer);
        var b = new global.Int16Array(buffer);
        var c = new global.Int32Array(buffer);
        var d = new global.Uint8Array(buffer);
        var e = new global.Uint16Array(buffer);
        var f = new global.Uint32Array(buffer);
        var g = new global.Float32Array(buffer);
        var h = new global.Float64Array(buffer);
        var i = env.STACKTOP | 0;
        var j = env.STACK_MAX | 0;
        var k = env.tempDoublePtr | 0;
        var l = env.ABORT | 0;
        var m = env.cttz_i8 | 0;
        var n = env.ctlz_i8 | 0;
        var o = 0;
        var p = 0;
        var q = 0;
        var r = 0;
        var s = +env.NaN,
            t = +env.Infinity;
        var u = 0,
            v = 0,
            w = 0,
            x = 0,
            y = 0.0,
            z = 0,
            A = 0,
            B = 0,
            C = 0.0;
        var D = 0;
        var E = 0;
        var F = 0;
        var G = 0;
        var H = 0;
        var I = 0;
        var J = 0;
        var K = 0;
        var L = 0;
        var M = 0;
        var N = global.Math.floor;
        var O = global.Math.abs;
        var P = global.Math.sqrt;
        var Q = global.Math.pow;
        var R = global.Math.cos;
        var S = global.Math.sin;
        var T = global.Math.tan;
        var U = global.Math.acos;
        var V = global.Math.asin;
        var W = global.Math.atan;
        var X = global.Math.atan2;
        var Y = global.Math.exp;
        var Z = global.Math.log;
        var _ = global.Math.ceil;
        var $ = global.Math.imul;
        var aa = env.abort;
        var ba = env.assert;
        var ca = env.min;
        var da = env.invoke_iiii;
        var ea = env.invoke_viiiiiiiiii;
        var fa = env.invoke_viiiiiii;
        var ga = env.invoke_viiiiiiiiiiiii;
        var ha = env.invoke_vi;
        var ia = env.invoke_vii;
        var ja = env.invoke_iiiiiii;
        var ka = env.invoke_ii;
        var la = env.invoke_viii;
        var ma = env.invoke_iiiii;
        var na = env.invoke_viiiiii;
        var oa = env.invoke_iii;
        var pa = env.invoke_iiiiii;
        var qa = env.invoke_viiii;
        var ra = env._sbrk;
        var sa = env._lrint;
        var ta = env._abort;
        var ua = env._emscripten_memcpy_big;
        var va = env._rint;
        var wa = 0.0;
        // EMSCRIPTEN_START_FUNCS
        function La(a) {
            a = a | 0;
            var b = 0;
            b = i;
            i = i + a | 0;
            i = i + 15 & -16;
            return b | 0
        }

        function Ma() {
            return i | 0
        }

        function Na(a) {
            a = a | 0;
            i = a
        }

        function Oa(a, b) {
            a = a | 0;
            b = b | 0;
            if (!o) {
                o = a;
                p = b
            }
        }

        function Pa(b) {
            b = b | 0;
            a[k >> 0] = a[b >> 0];
            a[k + 1 >> 0] = a[b + 1 >> 0];
            a[k + 2 >> 0] = a[b + 2 >> 0];
            a[k + 3 >> 0] = a[b + 3 >> 0]
        }

        function Qa(b) {
            b = b | 0;
            a[k >> 0] = a[b >> 0];
            a[k + 1 >> 0] = a[b + 1 >> 0];
            a[k + 2 >> 0] = a[b + 2 >> 0];
            a[k + 3 >> 0] = a[b + 3 >> 0];
            a[k + 4 >> 0] = a[b + 4 >> 0];
            a[k + 5 >> 0] = a[b + 5 >> 0];
            a[k + 6 >> 0] = a[b + 6 >> 0];
            a[k + 7 >> 0] = a[b + 7 >> 0]
        }

        function Ra(a) {
            a = a | 0;
            D = a
        }

        function Sa() {
            return D | 0
        }

        function Ta(b, d) {
            b = b | 0;
            d = d | 0;
            var e = 0,
                f = 0;
            e = i;
            if (!(a[(c[b + 204 >> 2] | 0) + 43 >> 0] | 0)) {
                i = e;
                return
            }
            f = c[(c[b + 200 >> 2] | 0) + 13128 >> 2] | 0;
            d = (d | 0) % (f | 0) | 0;
            if ((d | 0) != 2 ? !((f | 0) == 2 & (d | 0) == 0) : 0) {
                i = e;
                return
            }
            fe(c[b + 152 >> 2] | 0, c[b + 136 >> 2] | 0, 199) | 0;
            i = e;
            return
        }

        function Ua(b, d) {
            b = b | 0;
            d = d | 0;
            var e = 0,
                f = 0,
                g = 0,
                h = 0,
                j = 0;
            e = i;
            g = b + 204 | 0;
            f = c[g >> 2] | 0;
            if ((c[(c[f + 1668 >> 2] | 0) + (c[b + 2500 >> 2] << 2) >> 2] | 0) == (d | 0)) {
                Va(b);
                f = b + 1449 | 0;
                if (a[f >> 0] | 0) {
                    j = c[g >> 2] | 0;
                    if ((a[j + 42 >> 0] | 0) != 0 ? (j = c[j + 1676 >> 2] | 0, (c[j + (d << 2) >> 2] | 0) != (c[j + (d + -1 << 2) >> 2] | 0)) : 0) h = 5
                } else h = 5;
                if ((h | 0) == 5) Wa(b);
                if (a[b + 1448 >> 0] | 0) {
                    i = e;
                    return
                }
                if (!(a[(c[g >> 2] | 0) + 43 >> 0] | 0)) {
                    i = e;
                    return
                }
                g = c[(c[b + 200 >> 2] | 0) + 13128 >> 2] | 0;
                if ((d | 0) % (g | 0) | 0) {
                    i = e;
                    return
                }
                if ((g | 0) == 1) {
                    Wa(b);
                    i = e;
                    return
                }
                if ((a[f >> 0] | 0) != 1) {
                    i = e;
                    return
                }
                fe(c[b + 136 >> 2] | 0, c[b + 152 >> 2] | 0, 199) | 0;
                i = e;
                return
            }
            if ((a[f + 42 >> 0] | 0) != 0 ? (j = c[f + 1676 >> 2] | 0, (c[j + (d << 2) >> 2] | 0) != (c[j + (d + -1 << 2) >> 2] | 0)) : 0) {
                if ((a[b + 141 >> 0] | 0) == 1) Xa(c[b + 136 >> 2] | 0);
                else Va(b);
                Wa(b);
                f = c[g >> 2] | 0
            }
            if (!(a[f + 43 >> 0] | 0)) {
                i = e;
                return
            }
            f = b + 200 | 0;
            if ((d | 0) % (c[(c[f >> 2] | 0) + 13128 >> 2] | 0) | 0) {
                i = e;
                return
            }
            d = b + 136 | 0;
            Ya((c[d >> 2] | 0) + 224 | 0) | 0;
            if ((a[b + 141 >> 0] | 0) == 1) Xa(c[d >> 2] | 0);
            else Va(b);
            if ((c[(c[f >> 2] | 0) + 13128 >> 2] | 0) == 1) {
                Wa(b);
                i = e;
                return
            } else {
                fe(c[d >> 2] | 0, c[b + 152 >> 2] | 0, 199) | 0;
                i = e;
                return
            }
        }

        function Va(a) {
            a = a | 0;
            var b = 0,
                d = 0,
                e = 0,
                f = 0,
                g = 0,
                h = 0;
            b = i;
            e = a + 136 | 0;
            a = c[e >> 2] | 0;
            d = a + 204 | 0;
            ad(d, 1);
            g = a + 212 | 0;
            f = c[g >> 2] | 0;
            h = 0 - f & 7;
            if (h) {
                ad(d, h);
                f = c[g >> 2] | 0
            }
            Yc((c[e >> 2] | 0) + 224 | 0, (c[d >> 2] | 0) + ((f | 0) / 8 | 0) | 0, (7 - f + (c[a + 216 >> 2] | 0) | 0) / 8 | 0);
            i = b;
            return
        }

        function Wa(b) {
            b = b | 0;
            var e = 0,
                f = 0,
                g = 0,
                h = 0,
                j = 0,
                k = 0,
                l = 0;
            g = i;
            f = c[b + 1440 >> 2] | 0;
            e = 2 - f | 0;
            e = (a[b + 2060 >> 0] | 0) == 0 | (f | 0) == 2 ? e : e ^ 3;
            f = b + 2112 | 0;
            b = b + 136 | 0;
            h = 0;
            do {
                j = d[680 + (e * 199 | 0) + h >> 0] | 0;
                l = a[f >> 0] | 0;
                k = l << 24 >> 24;
                if (l << 24 >> 24 < 0) k = 0;
                else k = (k | 0) > 51 ? 51 : k;
                j = ((j << 3 & 120) + -16 + (($(k, ((j >>> 4) * 5 | 0) + -45 | 0) | 0) >> 4) << 1) + -127 | 0;
                j = j >> 31 ^ j;
                if ((j | 0) > 124) j = j & 1 | 124;
                a[(c[b >> 2] | 0) + h >> 0] = j;
                h = h + 1 | 0
            } while ((h | 0) != 199);
            a[(c[b >> 2] | 0) + 199 >> 0] = 0;
            a[(c[b >> 2] | 0) + 200 >> 0] = 0;
            a[(c[b >> 2] | 0) + 201 >> 0] = 0;
            a[(c[b >> 2] | 0) + 202 >> 0] = 0;
            i = g;
            return
        }

        function Xa(a) {
            a = a | 0;
            var b = 0,
                d = 0,
                e = 0,
                f = 0;
            b = i;
            d = a + 224 | 0;
            e = c[a + 240 >> 2] | 0;
            f = c[d >> 2] | 0;
            e = (f & 1 | 0) == 0 ? e : e + -1 | 0;
            e = (f & 511 | 0) == 0 ? e : e + -1 | 0;
            a = (c[a + 244 >> 2] | 0) - e | 0;
            if ((a | 0) < 0) {
                i = b;
                return
            }
            Yc(d, e, a);
            i = b;
            return
        }

        function Ya(a) {
            a = a | 0;
            var b = 0,
                d = 0,
                e = 0,
                f = 0,
                g = 0;
            b = i;
            f = a + 4 | 0;
            d = c[f >> 2] | 0;
            e = d + -2 | 0;
            c[f >> 2] = e;
            g = c[a >> 2] | 0;
            if ((g | 0) >= (e << 17 | 0)) {
                g = (c[a + 16 >> 2] | 0) - (c[a + 12 >> 2] | 0) | 0;
                i = b;
                return g | 0
            }
            d = (d + -258 | 0) >>> 31;
            c[f >> 2] = e << d;
            g = g << d;
            c[a >> 2] = g;
            if (g & 65535) {
                g = 0;
                i = b;
                return g | 0
            }
            yb(a);
            g = 0;
            i = b;
            return g | 0
        }

        function Za(a) {
            a = a | 0;
            var b = 0;
            b = i;
            a = c[a + 136 >> 2] | 0;
            a = _a(a + 224 | 0, a) | 0;
            i = b;
            return a | 0
        }

        function _a(b, e) {
            b = b | 0;
            e = e | 0;
            var f = 0,
                g = 0,
                h = 0,
                j = 0,
                k = 0,
                l = 0,
                m = 0,
                n = 0;
            f = i;
            h = d[e >> 0] | 0;
            j = b + 4 | 0;
            k = c[j >> 2] | 0;
            l = d[2880 + ((k << 1 & 384) + (h | 512)) >> 0] | 0;
            k = k - l | 0;
            m = k << 17;
            n = c[b >> 2] | 0;
            g = m - n >> 31;
            c[b >> 2] = n - (g & m);
            c[j >> 2] = (g & l - k) + k;
            h = g ^ h;
            a[e >> 0] = a[h + 4032 >> 0] | 0;
            e = h & 1;
            h = c[j >> 2] | 0;
            g = d[2880 + h >> 0] | 0;
            c[j >> 2] = h << g;
            g = c[b >> 2] << g;
            c[b >> 2] = g;
            if (g & 65535) {
                i = f;
                return e | 0
            }
            j = b + 16 | 0;
            h = c[j >> 2] | 0;
            c[b >> 2] = (((d[h + 1 >> 0] | 0) << 1 | (d[h >> 0] | 0) << 9) + -65535 << 7 - (d[2880 + ((g + -1 ^ g) >> 15) >> 0] | 0)) + g;
            if (h >>> 0 >= (c[b + 20 >> 2] | 0) >>> 0) {
                i = f;
                return e | 0
            }
            c[j >> 2] = h + 2;
            i = f;
            return e | 0
        }

        function $a(a) {
            a = a | 0;
            var b = 0,
                d = 0;
            b = i;
            a = a + 136 | 0;
            d = c[a >> 2] | 0;
            if (!(_a(d + 224 | 0, d + 1 | 0) | 0)) {
                d = 0;
                i = b;
                return d | 0
            }
            d = (ab((c[a >> 2] | 0) + 224 | 0) | 0) == 0;
            d = d ? 1 : 2;
            i = b;
            return d | 0
        }

        function ab(a) {
            a = a | 0;
            var b = 0,
                d = 0,
                e = 0;
            b = i;
            d = c[a >> 2] << 1;
            c[a >> 2] = d;
            if (!(d & 65534)) {
                yb(a);
                d = c[a >> 2] | 0
            }
            e = c[a + 4 >> 2] << 17;
            if ((d | 0) < (e | 0)) {
                e = 0;
                i = b;
                return e | 0
            }
            c[a >> 2] = d - e;
            e = 1;
            i = b;
            return e | 0
        }

        function bb(a) {
            a = a | 0;
            var b = 0,
                d = 0;
            b = i;
            d = a + 136 | 0;
            a = (ab((c[d >> 2] | 0) + 224 | 0) | 0) << 1;
            a = (ab((c[d >> 2] | 0) + 224 | 0) | 0 | a) << 1;
            a = (ab((c[d >> 2] | 0) + 224 | 0) | 0 | a) << 1;
            a = (ab((c[d >> 2] | 0) + 224 | 0) | 0 | a) << 1;
            a = ab((c[d >> 2] | 0) + 224 | 0) | 0 | a;
            i = b;
            return a | 0
        }

        function cb(a) {
            a = a | 0;
            var b = 0,
                d = 0,
                e = 0,
                f = 0;
            b = i;
            d = c[(c[a + 200 >> 2] | 0) + 52 >> 2] | 0;
            d = (d | 0) > 10 ? 31 : (1 << d + -5) + -1 | 0;
            e = a + 136 | 0;
            if ((d | 0) > 0) a = 0;
            else {
                f = 0;
                i = b;
                return f | 0
            }
            while (1) {
                f = a + 1 | 0;
                if (!(ab((c[e >> 2] | 0) + 224 | 0) | 0)) {
                    d = 4;
                    break
                }
                if ((f | 0) < (d | 0)) a = f;
                else {
                    a = f;
                    d = 4;
                    break
                }
            }
            if ((d | 0) == 4) {
                i = b;
                return a | 0
            }
            return 0
        }

        function db(a) {
            a = a | 0;
            var b = 0;
            b = i;
            a = ab((c[a + 136 >> 2] | 0) + 224 | 0) | 0;
            i = b;
            return a | 0
        }

        function eb(a) {
            a = a | 0;
            var b = 0,
                d = 0;
            b = i;
            d = a + 136 | 0;
            a = (ab((c[d >> 2] | 0) + 224 | 0) | 0) << 1;
            a = ab((c[d >> 2] | 0) + 224 | 0) | 0 | a;
            i = b;
            return a | 0
        }

        function fb(a) {
            a = a | 0;
            var b = 0;
            b = i;
            a = Ya((c[a + 136 >> 2] | 0) + 224 | 0) | 0;
            i = b;
            return a | 0
        }

        function gb(a) {
            a = a | 0;
            var b = 0;
            b = i;
            a = c[a + 136 >> 2] | 0;
            a = _a(a + 224 | 0, a + 5 | 0) | 0;
            i = b;
            return a | 0
        }

        function hb(a) {
            a = a | 0;
            var b = 0,
                d = 0,
                e = 0,
                f = 0,
                g = 0,
                h = 0;
            b = i;
            a = a + 136 | 0;
            g = 9;
            e = 0;
            while (1) {
                h = c[a >> 2] | 0;
                f = e;
                e = e + 1 | 0;
                if (!(_a(h + 224 | 0, h + g | 0) | 0)) {
                    e = f;
                    g = 0;
                    break
                }
                if ((e | 0) >= 5) {
                    f = 0;
                    g = 0;
                    d = 4;
                    break
                } else g = 10
            }
            do
                if ((d | 0) == 4) {
                    while (1) {
                        d = 0;
                        if (!(ab((c[a >> 2] | 0) + 224 | 0) | 0)) {
                            d = 5;
                            break
                        }
                        g = (1 << f) + g | 0;
                        f = f + 1 | 0;
                        if ((f | 0) < 31) d = 4;
                        else break
                    }
                    if ((d | 0) == 5)
                        if (!f) break;
                    do {
                        f = f + -1 | 0;
                        g = ((ab((c[a >> 2] | 0) + 224 | 0) | 0) << f) + g | 0
                    } while ((f | 0) != 0)
                }
            while (0);
            i = b;
            return g + e | 0
        }

        function ib(a) {
            a = a | 0;
            var b = 0;
            b = i;
            a = ab((c[a + 136 >> 2] | 0) + 224 | 0) | 0;
            i = b;
            return a | 0
        }

        function jb(a) {
            a = a | 0;
            var b = 0;
            b = i;
            a = c[a + 136 >> 2] | 0;
            a = _a(a + 224 | 0, a + 176 | 0) | 0;
            i = b;
            return a | 0
        }

        function kb(b) {
            b = b | 0;
            var d = 0,
                e = 0,
                f = 0,
                g = 0,
                h = 0;
            d = i;
            e = a[(c[b + 204 >> 2] | 0) + 1633 >> 0] | 0;
            e = (e & 255) < 5 ? 5 : e & 255;
            f = b + 136 | 0;
            if (!e) {
                g = 0;
                i = d;
                return g | 0
            } else b = 0;
            while (1) {
                h = c[f >> 2] | 0;
                g = b + 1 | 0;
                if (!(_a(h + 224 | 0, h + 177 | 0) | 0)) {
                    e = 4;
                    break
                }
                if ((g | 0) < (e | 0)) b = g;
                else {
                    b = g;
                    e = 4;
                    break
                }
            }
            if ((e | 0) == 4) {
                i = d;
                return b | 0
            }
            return 0
        }

        function lb(b, e, f, g) {
            b = b | 0;
            e = e | 0;
            f = f | 0;
            g = g | 0;
            var h = 0,
                j = 0,
                k = 0,
                l = 0,
                m = 0,
                n = 0;
            j = i;
            k = c[b + 200 >> 2] | 0;
            n = (1 << c[k + 13080 >> 2]) + -1 | 0;
            l = n & g;
            m = c[k + 13064 >> 2] | 0;
            h = f >> m;
            m = g >> m;
            g = c[b + 136 >> 2] | 0;
            if ((a[g + 308 >> 0] | 0) == 0 ? (n & f | 0) == 0 : 0) f = 0;
            else {
                f = h + -1 + ($(c[k + 13140 >> 2] | 0, m) | 0) | 0;
                f = d[(c[b + 4336 >> 2] | 0) + f >> 0] | 0
            }
            if ((a[g + 309 >> 0] | 0) == 0 & (l | 0) == 0) {
                n = 0;
                m = (f | 0) > (e | 0);
                m = m & 1;
                n = (n | 0) > (e | 0);
                n = n & 1;
                f = g + 224 | 0;
                m = m | 2;
                n = m + n | 0;
                n = g + n | 0;
                n = _a(f, n) | 0;
                i = j;
                return n | 0
            }
            n = ($(c[k + 13140 >> 2] | 0, m + -1 | 0) | 0) + h | 0;
            n = d[(c[b + 4336 >> 2] | 0) + n >> 0] | 0;
            m = (f | 0) > (e | 0);
            m = m & 1;
            n = (n | 0) > (e | 0);
            n = n & 1;
            f = g + 224 | 0;
            m = m | 2;
            n = m + n | 0;
            n = g + n | 0;
            n = _a(f, n) | 0;
            i = j;
            return n | 0
        }

        function mb(a, b) {
            a = a | 0;
            b = b | 0;
            var d = 0;
            d = i;
            b = c[a + 136 >> 2] | 0;
            b = (_a(b + 224 | 0, b + 13 | 0) | 0) == 0;
            i = d;
            return (b ? 3 : 0) | 0
        }

        function nb(a) {
            a = a | 0;
            var b = 0;
            b = i;
            a = Ya((c[a + 136 >> 2] | 0) + 224 | 0) | 0;
            i = b;
            return a | 0
        }

        function ob(a) {
            a = a | 0;
            var b = 0;
            b = i;
            a = c[a + 136 >> 2] | 0;
            a = _a(a + 224 | 0, a + 17 | 0) | 0;
            i = b;
            return a | 0
        }

        function pb(a) {
            a = a | 0;
            var b = 0,
                d = 0,
                e = 0;
            b = i;
            e = a + 136 | 0;
            d = 0;
            while (1) {
                a = d + 1 | 0;
                if (!(ab((c[e >> 2] | 0) + 224 | 0) | 0)) {
                    a = d;
                    d = 4;
                    break
                }
                if ((a | 0) < 2) d = a;
                else {
                    d = 4;
                    break
                }
            }
            if ((d | 0) == 4) {
                i = b;
                return a | 0
            }
            return 0
        }

        function qb(a) {
            a = a | 0;
            var b = 0,
                d = 0;
            b = i;
            d = a + 136 | 0;
            a = (ab((c[d >> 2] | 0) + 224 | 0) | 0) << 1;
            a = (ab((c[d >> 2] | 0) + 224 | 0) | 0 | a) << 1;
            a = (ab((c[d >> 2] | 0) + 224 | 0) | 0 | a) << 1;
            a = (ab((c[d >> 2] | 0) + 224 | 0) | 0 | a) << 1;
            a = ab((c[d >> 2] | 0) + 224 | 0) | 0 | a;
            i = b;
            return a | 0
        }

        function rb(a) {
            a = a | 0;
            var b = 0,
                d = 0;
            b = i;
            a = a + 136 | 0;
            d = c[a >> 2] | 0;
            if (!(_a(d + 224 | 0, d + 18 | 0) | 0)) {
                d = 4;
                i = b;
                return d | 0
            }
            d = (ab((c[a >> 2] | 0) + 224 | 0) | 0) << 1;
            d = ab((c[a >> 2] | 0) + 224 | 0) | 0 | d;
            i = b;
            return d | 0
        }

        function sb(a, b) {
            a = a | 0;
            b = b | 0;
            var d = 0;
            d = i;
            a = c[a + 136 >> 2] | 0;
            a = _a(a + 224 | 0, a + (42 - b) | 0) | 0;
            i = d;
            return a | 0
        }

        function tb(a, b) {
            a = a | 0;
            b = b | 0;
            var d = 0;
            d = i;
            a = c[a + 136 >> 2] | 0;
            a = _a(a + 224 | 0, a + (b + 42) | 0) | 0;
            i = d;
            return a | 0
        }

        function ub(a, b) {
            a = a | 0;
            b = b | 0;
            var d = 0;
            d = i;
            a = c[a + 136 >> 2] | 0;
            a = _a(a + 224 | 0, a + ((b | 0) == 0 | 40) | 0) | 0;
            i = d;
            return a | 0
        }

        function vb(a, b) {
            a = a | 0;
            b = b | 0;
            var d = 0,
                e = 0,
                f = 0,
                g = 0;
            d = i;
            a = a + 136 | 0;
            f = (b << 2) + 166 | 0;
            e = 0;
            while (1) {
                g = c[a >> 2] | 0;
                b = e + 1 | 0;
                if (!(_a(g + 224 | 0, g + (f + e) | 0) | 0)) {
                    b = e;
                    a = 4;
                    break
                }
                if ((b | 0) < 4) e = b;
                else {
                    a = 4;
                    break
                }
            }
            if ((a | 0) == 4) {
                i = d;
                return b | 0
            }
            return 0
        }

        function wb(a, b) {
            a = a | 0;
            b = b | 0;
            var d = 0;
            d = i;
            a = c[a + 136 >> 2] | 0;
            a = _a(a + 224 | 0, a + (b + 174) | 0) | 0;
            i = d;
            return a | 0
        }

        function xb(f, g, h, j, k, l) {
            f = f | 0;
            g = g | 0;
            h = h | 0;
            j = j | 0;
            k = k | 0;
            l = l | 0;
            var m = 0,
                n = 0,
                o = 0,
                p = 0,
                q = 0,
                r = 0,
                s = 0,
                t = 0,
                u = 0,
                v = 0,
                w = 0,
                x = 0,
                y = 0,
                z = 0,
                A = 0,
                B = 0,
                C = 0,
                E = 0,
                F = 0,
                G = 0,
                H = 0,
                I = 0,
                J = 0,
                K = 0,
                L = 0,
                M = 0,
                N = 0,
                O = 0,
                P = 0,
                Q = 0,
                R = 0,
                S = 0,
                T = 0,
                U = 0,
                V = 0,
                W = 0,
                X = 0,
                Y = 0,
                Z = 0,
                _ = 0,
                aa = 0,
                ba = 0,
                ca = 0,
                da = 0,
                ea = 0,
                fa = 0,
                ga = 0,
                ha = 0,
                ia = 0,
                ja = 0,
                ka = 0,
                la = 0,
                ma = 0,
                na = 0,
                oa = 0,
                pa = 0,
                qa = 0,
                ra = 0,
                sa = 0,
                ta = 0,
                ua = 0,
                va = 0,
                wa = 0,
                xa = 0,
                ya = 0,
                za = 0,
                Aa = 0,
                Ba = 0,
                Da = 0,
                Ea = 0,
                Ga = 0,
                Ha = 0,
                Ia = 0,
                Ja = 0,
                La = 0,
                Ma = 0,
                Na = 0;
            o = i;
            i = i + 96 | 0;
            v = o + 24 | 0;
            u = o + 8 | 0;
            s = o;
            t = f + 136 | 0;
            p = c[t >> 2] | 0;
            q = c[f + 160 >> 2] | 0;
            m = c[q + (l << 2) + 32 >> 2] | 0;
            n = f + 200 | 0;
            T = c[n >> 2] | 0;
            h = $(h >> c[T + (l << 2) + 13180 >> 2], m) | 0;
            g = (c[q + (l << 2) >> 2] | 0) + (h + (g >> c[T + (l << 2) + 13168 >> 2] << c[T + 56 >> 2])) | 0;
            T = (l | 0) != 0;
            h = p + 320 | 0;
            q = T ? p + 11680 | 0 : h;
            w = v + 0 | 0;
            r = w + 64 | 0;
            do {
                a[w >> 0] = 0;
                w = w + 1 | 0
            } while ((w | 0) < (r | 0));
            S = 1 << j;
            y = (l | 0) == 0;
            w = c[(y ? p + 288 | 0 : p + 292 | 0) >> 2] | 0;
            r = S << j;
            ce(q | 0, 0, r << 1 | 0) | 0;
            z = p + 31256 | 0;
            if (!(a[z >> 0] | 0)) {
                A = a[p + 272 >> 0] | 0;
                C = f + 204 | 0;
                Ma = c[C >> 2] | 0;
                if ((a[Ma + 21 >> 0] | 0) != 0 ? (d[Ma + 1629 >> 0] | 0) >= (j | 0) : 0) {
                    F = c[t >> 2] | 0;
                    F = _a(F + 224 | 0, F + (T & 1 | 46) | 0) | 0
                } else F = 0;
                if (y) {
                    B = c[n >> 2] | 0;
                    G = B;
                    B = (c[B + 13192 >> 2] | 0) + A | 0
                } else {
                    B = c[C >> 2] | 0;
                    if ((l | 0) == 1) B = (c[f + 2072 >> 2] | 0) + (c[B + 28 >> 2] | 0) + (a[p + 302 >> 0] | 0) | 0;
                    else B = (c[f + 2076 >> 2] | 0) + (c[B + 32 >> 2] | 0) + (a[p + 303 >> 0] | 0) | 0;
                    E = B + A | 0;
                    G = c[n >> 2] | 0;
                    A = c[G + 13192 >> 2] | 0;
                    B = 0 - A | 0;
                    if ((E | 0) >= (B | 0)) B = (E | 0) > 57 ? 57 : E;
                    do
                        if ((c[G + 4 >> 2] | 0) == 1) {
                            if ((B | 0) >= 30)
                                if ((B | 0) > 43) {
                                    B = B + -6 | 0;
                                    break
                                } else {
                                    B = c[176 + (B + -30 << 2) >> 2] | 0;
                                    break
                                }
                        } else B = (B | 0) > 51 ? 51 : B;
                    while (0);
                    B = A + B | 0
                }
                A = (c[G + 52 >> 2] | 0) + j | 0;
                E = A + -5 | 0;
                A = 1 << A + -6;
                B = d[168 + (d[232 + B >> 0] | 0) >> 0] << d[312 + B >> 0];
                if ((a[G + 634 >> 0] | 0) != 0 ? !((F | 0) != 0 & (j | 0) > 2) : 0) {
                    H = c[C >> 2] | 0;
                    H = (a[H + 68 >> 0] | 0) == 0 ? G + 635 | 0 : H + 69 | 0;
                    G = ((c[p + 31244 >> 2] | 0) != 1 ? 3 : 0) + l | 0;
                    C = H + ((j + -2 | 0) * 384 | 0) + (G << 6) | 0;
                    if ((j | 0) > 3) ia = a[H + ((j + -4 | 0) * 6 | 0) + G + 1536 >> 0] | 0;
                    else ia = 16
                } else {
                    ia = 16;
                    C = 0
                }
            } else {
                A = 0;
                ia = 0;
                B = 0;
                C = 0;
                E = 0;
                F = 0
            }
            J = (j << 1) + -1 | 0;
            if (y) {
                G = (j * 3 | 0) + -6 + (j + -1 >> 2) | 0;
                I = j + 1 >> 2
            } else {
                G = 15;
                I = j + -2 | 0
            }
            if ((J | 0) > 0) {
                K = G + 52 | 0;
                H = 0;
                while (1) {
                    Ma = c[t >> 2] | 0;
                    L = H + 1 | 0;
                    if (!(_a(Ma + 224 | 0, Ma + (K + (H >> I)) | 0) | 0)) break;
                    if ((L | 0) < (J | 0)) H = L;
                    else {
                        H = L;
                        break
                    }
                }
                L = G + 70 | 0;
                G = 0;
                while (1) {
                    Ma = c[t >> 2] | 0;
                    K = G + 1 | 0;
                    if (!(_a(Ma + 224 | 0, Ma + (L + (G >> I)) | 0) | 0)) break;
                    if ((K | 0) < (J | 0)) G = K;
                    else {
                        G = K;
                        break
                    }
                }
                if ((H | 0) > 3) {
                    I = (H >> 1) + -1 | 0;
                    K = ab((c[t >> 2] | 0) + 224 | 0) | 0;
                    if ((I | 0) > 1) {
                        J = 1;
                        do {
                            K = ab((c[t >> 2] | 0) + 224 | 0) | 0 | K << 1;
                            J = J + 1 | 0
                        } while ((J | 0) != (I | 0))
                    }
                    H = K + ((H & 1 | 2) << I) | 0
                }
                if ((G | 0) > 3) {
                    J = (G >> 1) + -1 | 0;
                    K = ab((c[t >> 2] | 0) + 224 | 0) | 0;
                    if ((J | 0) > 1) {
                        I = 1;
                        do {
                            K = ab((c[t >> 2] | 0) + 224 | 0) | 0 | K << 1;
                            I = I + 1 | 0
                        } while ((I | 0) != (J | 0))
                    }
                    I = H;
                    L = K + ((G & 1 | 2) << J) | 0
                } else {
                    I = H;
                    L = G
                }
            } else {
                I = 0;
                L = 0
            }
            do
                if ((k | 0) != 2) {
                    M = I >> 2;
                    N = L >> 2;
                    if ((k | 0) == 1) {
                        G = I;
                        H = L;
                        P = d[536 + (L << 3) + I >> 0] | 0;
                        I = 488;
                        L = 504;
                        J = 496;
                        K = 520;
                        break
                    } else if (k) {
                        J = I;
                        K = L;
                        x = 49;
                        break
                    }
                    P = d[(I & 3) + (392 + ((L & 3) << 2)) >> 0] | 0;
                    if ((S | 0) == 8) {
                        G = I;
                        H = L;
                        P = (d[416 + (N << 1) + M >> 0] << 4) + P | 0;
                        I = 496;
                        L = 8;
                        J = 488;
                        K = 24;
                        break
                    } else if ((S | 0) == 16) {
                        G = I;
                        H = L;
                        P = (d[392 + (N << 2) + M >> 0] << 4) + P | 0;
                        I = 8;
                        L = 8;
                        J = 24;
                        K = 24;
                        break
                    } else if ((S | 0) == 4) {
                        G = I;
                        H = L;
                        I = 408;
                        L = 8;
                        J = 408;
                        K = 24;
                        break
                    } else {
                        G = I;
                        H = L;
                        P = (d[424 + (N << 3) + M >> 0] << 4) + P | 0;
                        I = 40;
                        L = 8;
                        J = 104;
                        K = 24;
                        break
                    }
                } else {
                    J = L;
                    K = I;
                    M = L >> 2;
                    N = I >> 2;
                    x = 49
                }
            while (0);
            if ((x | 0) == 49) {
                G = J;
                H = K;
                P = d[536 + (J << 3) + K >> 0] | 0;
                I = 496;
                L = 520;
                J = 488;
                K = 504
            }
            O = P + 1 | 0;
            Q = P >> 4;
            if ((Q | 0) > -1) {
                P = (1 << j + -2) + -1 | 0;
                l = (l | 0) > 0;
                R = l ? 90 : 88;
                S = S + -1 >> 2;
                W = T ? 27 : 0;
                U = (j | 0) == 2;
                T = W + 3 | 0;
                V = (j | 0) == 3;
                Z = (k | 0) == 0 ? 9 : 15;
                _ = y ? 0 : 27;
                da = (F | 0) == 0;
                aa = y ? 42 : 43;
                fa = y ? 40 : 41;
                ba = y ? 2 : 0;
                ea = p + 31244 | 0;
                ca = w & -17;
                ga = f + 204 | 0;
                Y = ((B | 0) < 0) << 31 >> 31;
                X = ((A | 0) < 0) << 31 >> 31;
                ha = (F | 0) != 0 & (j | 0) > 2;
                k = (j | 0) < 4;
                ia = ia & 255;
                ma = (y & 1) << 1;
                ja = ma | 1;
                ra = 1;
                ka = Q;
                oa = 0;
                xa = 16;
                while (1) {
                    na = ka << 4;
                    wa = a[I + ka >> 0] | 0;
                    ta = wa & 255;
                    va = a[J + ka >> 0] | 0;
                    ua = va & 255;
                    la = (ka | 0) > 0;
                    if ((ka | 0) < (Q | 0) & la) {
                        if ((ta | 0) < (P | 0)) pa = d[v + (ta + 1 << 3) + ua >> 0] | 0;
                        else pa = 0;
                        if ((ua | 0) < (P | 0)) pa = (d[ua + 1 + (v + (ta << 3)) >> 0] | 0) + pa | 0;
                        ya = c[t >> 2] | 0;
                        ya = (_a(ya + 224 | 0, ya + (((pa | 0) > 1 ? 1 : pa) + R) | 0) | 0) & 255;
                        a[v + (ta << 3) + ua >> 0] = ya;
                        qa = 1
                    } else {
                        if (!((ta | 0) == (M | 0) & (ua | 0) == (N | 0)))
                            if (!(wa << 24 >> 24)) ya = va << 24 >> 24 == 0 & 1;
                            else ya = 0;
                        else ya = 1;
                        a[v + (ta << 3) + ua >> 0] = ya;
                        qa = 0
                    }
                    na = O - na | 0;
                    pa = (ka | 0) == (Q | 0);
                    if (pa) {
                        a[u >> 0] = na + 255;
                        sa = na + -2 | 0;
                        na = 1
                    } else {
                        sa = 15;
                        na = 0
                    }
                    if ((ta | 0) < (S | 0)) za = (a[v + (ta + 1 << 3) + ua >> 0] | 0) != 0 & 1;
                    else za = 0;
                    if ((ua | 0) < (S | 0)) za = ((a[ua + 1 + (v + (ta << 3)) >> 0] | 0) != 0 & 1) << 1 | za;
                    do
                        if (ya << 24 >> 24 != 0 & (sa | 0) > -1) {
                            if (!(c[(c[n >> 2] | 0) + 13100 >> 2] | 0))
                                if (U) {
                                    wa = 600;
                                    va = W
                                } else x = 73;
                            else if (da) {
                                ya = (a[z >> 0] | 0) != 0;
                                if (ya | U) {
                                    wa = ya ? 664 : 600;
                                    va = ya ? fa : W
                                } else x = 73
                            } else {
                                wa = 664;
                                va = fa
                            }
                            do
                                if ((x | 0) == 73) {
                                    x = 0;
                                    ya = (za << 4) + 616 | 0;
                                    if (!y) {
                                        wa = ya;
                                        va = W + (V ? 9 : 12) | 0;
                                        break
                                    }
                                    va = (va | wa) << 24 >> 24 == 0 ? W : T;
                                    if (V) {
                                        wa = ya;
                                        va = va + Z | 0;
                                        break
                                    } else {
                                        wa = ya;
                                        va = va + 21 | 0;
                                        break
                                    }
                                }
                            while (0);
                            if ((sa | 0) > 0) {
                                ya = va + 92 | 0;
                                do {
                                    Ma = c[t >> 2] | 0;
                                    if (_a(Ma + 224 | 0, Ma + (ya + (d[wa + ((d[K + sa >> 0] << 2) + (d[L + sa >> 0] | 0)) >> 0] | 0)) | 0) | 0) {
                                        a[u + (na & 255) >> 0] = sa;
                                        qa = 0;
                                        na = na + 1 << 24 >> 24
                                    }
                                    sa = sa + -1 | 0
                                } while ((sa | 0) > 0)
                            }
                            if (qa) {
                                a[u + (na & 255) >> 0] = 0;
                                qa = na + 1 << 24 >> 24;
                                break
                            }
                            if (c[(c[n >> 2] | 0) + 13100 >> 2] | 0)
                                if (da ? (a[z >> 0] | 0) == 0 : 0) x = 87;
                                else qa = aa;
                            else x = 87;
                            if ((x | 0) == 87) {
                                x = 0;
                                qa = (ka | 0) == 0 ? _ : va + 2 | 0
                            }
                            Ma = c[t >> 2] | 0;
                            if ((_a(Ma + 224 | 0, Ma + (qa + 92) | 0) | 0) == 1) {
                                a[u + (na & 255) >> 0] = 0;
                                qa = na + 1 << 24 >> 24
                            } else qa = na
                        } else qa = na;
                    while (0);
                    na = qa & 255;
                    a: do
                        if (qa << 24 >> 24) {
                            qa = la ? ba : 0;
                            if (!(c[(c[n >> 2] | 0) + 13116 >> 2] | 0)) Ea = 0;
                            else {
                                if (da ? (a[z >> 0] | 0) == 0 : 0) oa = ma;
                                else oa = ja;
                                Ea = (d[p + oa + 199 >> 0] | 0) >>> 2
                            }
                            sa = qa | (ra | 0) == 0 & (pa ^ 1) & 1;
                            Ba = a[u >> 0] | 0;
                            va = Ba & 255;
                            qa = na >>> 0 > 8 ? 8 : na;
                            if (!qa) {
                                pa = -1;
                                ra = 1
                            } else {
                                ya = sa << 2;
                                pa = -1;
                                ra = 1;
                                wa = 0;
                                do {
                                    Ma = ra + ya | 0;
                                    La = c[t >> 2] | 0;
                                    Ma = (_a(La + 224 | 0, La + ((l ? Ma + 16 | 0 : Ma) + 136) | 0) | 0) & 255;
                                    a[s + wa >> 0] = Ma;
                                    if (!(Ma << 24 >> 24)) ra = ((ra + -1 | 0) >>> 0 < 2 & 1) + ra | 0;
                                    else {
                                        pa = (pa | 0) == -1 ? wa : pa;
                                        ra = 0
                                    }
                                    wa = wa + 1 | 0
                                } while ((wa | 0) < (qa | 0))
                            }
                            wa = na + -1 | 0;
                            qa = a[u + wa >> 0] | 0;
                            ya = qa & 255;
                            do
                                if (!(a[z >> 0] | 0)) {
                                    if ((c[ea >> 2] | 0) == 1 ? !((c[(c[n >> 2] | 0) + 13104 >> 2] | 0) == 0 | da | (ca | 0) != 10) : 0) {
                                        va = 0;
                                        break
                                    }
                                    va = (va - ya | 0) > 3 & 1
                                } else va = 0;
                            while (0);
                            if ((pa | 0) != -1) {
                                La = c[t >> 2] | 0;
                                La = _a(La + 224 | 0, La + ((l ? sa | 4 : sa) | 160) | 0) | 0;
                                Ma = s + pa | 0;
                                a[Ma >> 0] = (d[Ma >> 0] | 0) + La
                            }
                            sa = (va | 0) == 0;
                            if ((a[(c[ga >> 2] | 0) + 4 >> 0] | 0) == 0 | sa) {
                                wa = 0;
                                va = 0;
                                do {
                                    va = ab((c[t >> 2] | 0) + 224 | 0) | 0 | va << 1;
                                    wa = wa + 1 | 0
                                } while ((wa | 0) < (na | 0));
                                za = va << 16 - na
                            } else {
                                va = wa & 255;
                                if (!((wa & 255) << 24 >> 24)) ya = 0;
                                else {
                                    wa = 0;
                                    ya = 0;
                                    do {
                                        ya = ab((c[t >> 2] | 0) + 224 | 0) | 0 | ya << 1;
                                        wa = wa + 1 | 0
                                    } while ((wa | 0) < (va | 0))
                                }
                                za = ya << 17 - na
                            }
                            ta = ta << 2;
                            va = ua << 2;
                            ua = p + oa + 199 | 0;
                            wa = 0;
                            Ga = 0;
                            Aa = xa;
                            Da = 0;
                            while (1) {
                                xa = Ba & 255;
                                ya = (d[L + xa >> 0] | 0) + ta | 0;
                                xa = (d[K + xa >> 0] | 0) + va | 0;
                                b: do
                                    if ((wa | 0) < 8) {
                                        Ha = (d[s + wa >> 0] | 0) + 1 | 0;
                                        Ma = (wa | 0) == (pa | 0);
                                        if ((Ha | 0) == ((Ma ? 3 : 2) | 0) & 0 == ((Ma ? 0 : 0) | 0)) Ia = 0;
                                        else {
                                            Ia = 0;
                                            break
                                        }
                                        while (1) {
                                            Ja = Ia + 1 | 0;
                                            if (!(ab((c[t >> 2] | 0) + 224 | 0) | 0)) {
                                                x = 120;
                                                break
                                            }
                                            if ((Ja | 0) < 31) Ia = Ja;
                                            else {
                                                x = 124;
                                                break
                                            }
                                        }
                                        do
                                            if ((x | 0) == 120) {
                                                x = 0;
                                                if ((Ia | 0) >= 3) {
                                                    Ja = Ia;
                                                    x = 124;
                                                    break
                                                }
                                                if ((Ea | 0) > 0) {
                                                    Ja = 0;
                                                    La = 0;
                                                    do {
                                                        La = ab((c[t >> 2] | 0) + 224 | 0) | 0 | La << 1;
                                                        Ja = Ja + 1 | 0
                                                    } while ((Ja | 0) != (Ea | 0))
                                                } else La = 0;
                                                Ja = La + (Ia << Ea) | 0
                                            }
                                        while (0);
                                        if ((x | 0) == 124) {
                                            x = 0;
                                            Ia = Ja + -3 | 0;
                                            if ((Ia + Ea | 0) > 0) {
                                                La = Ea + -3 + Ja | 0;
                                                Ja = 0;
                                                Ma = 0;
                                                do {
                                                    Ma = ab((c[t >> 2] | 0) + 224 | 0) | 0 | Ma << 1;
                                                    Ja = Ja + 1 | 0
                                                } while ((Ja | 0) != (La | 0))
                                            } else Ma = 0;
                                            Ja = Ma + ((1 << Ia) + 2 << Ea) | 0
                                        }
                                        Ha = ae(Ja | 0, ((Ja | 0) < 0) << 31 >> 31 | 0, Ha | 0, 0) | 0;
                                        Ia = D;
                                        La = 3 << Ea;
                                        Na = ((La | 0) < 0) << 31 >> 31;
                                        Ma = c[(c[n >> 2] | 0) + 13116 >> 2] | 0;
                                        do
                                            if ((Ia | 0) > (Na | 0) | (Ia | 0) == (Na | 0) & Ha >>> 0 > La >>> 0) {
                                                La = Ea + 1 | 0;
                                                if (Ma) {
                                                    Ea = La;
                                                    break
                                                }
                                                Ea = (Ea | 0) > 3 ? 4 : La;
                                                break b
                                            }
                                        while (0);
                                        if (!((Ma | 0) != 0 & (Ga | 0) == 0)) break;
                                        Ga = a[ua >> 0] | 0;
                                        La = (Ga & 255) >>> 2;
                                        if ((Ja | 0) >= (3 << La | 0)) {
                                            a[ua >> 0] = Ga + 1 << 24 >> 24;
                                            Ga = 1;
                                            break
                                        }
                                        if ((Ja << 1 | 0) >= (1 << La | 0) | Ga << 24 >> 24 == 0) {
                                            Ga = 1;
                                            break
                                        }
                                        a[ua >> 0] = Ga + -1 << 24 >> 24;
                                        Ga = 1
                                    } else {
                                        Ha = 0;
                                        while (1) {
                                            Ia = Ha + 1 | 0;
                                            if (!(ab((c[t >> 2] | 0) + 224 | 0) | 0)) {
                                                x = 138;
                                                break
                                            }
                                            if ((Ia | 0) < 31) Ha = Ia;
                                            else {
                                                x = 142;
                                                break
                                            }
                                        }
                                        do
                                            if ((x | 0) == 138) {
                                                x = 0;
                                                if ((Ha | 0) >= 3) {
                                                    Ia = Ha;
                                                    x = 142;
                                                    break
                                                }
                                                if ((Ea | 0) > 0) {
                                                    Ia = 0;
                                                    Ja = 0;
                                                    do {
                                                        Ja = ab((c[t >> 2] | 0) + 224 | 0) | 0 | Ja << 1;
                                                        Ia = Ia + 1 | 0
                                                    } while ((Ia | 0) != (Ea | 0))
                                                } else Ja = 0;
                                                Ja = Ja + (Ha << Ea) | 0
                                            }
                                        while (0);
                                        if ((x | 0) == 142) {
                                            x = 0;
                                            Ha = Ia + -3 | 0;
                                            if ((Ha + Ea | 0) > 0) {
                                                Ja = Ea + -3 + Ia | 0;
                                                Ia = 0;
                                                La = 0;
                                                do {
                                                    La = ab((c[t >> 2] | 0) + 224 | 0) | 0 | La << 1;
                                                    Ia = Ia + 1 | 0
                                                } while ((Ia | 0) != (Ja | 0))
                                            } else La = 0;
                                            Ja = La + ((1 << Ha) + 2 << Ea) | 0
                                        }
                                        Ha = Ja + 1 | 0;
                                        Ia = ((Ha | 0) < 0) << 31 >> 31;
                                        Ma = c[(c[n >> 2] | 0) + 13116 >> 2] | 0;
                                        do
                                            if ((Ja | 0) >= (3 << Ea | 0)) {
                                                La = Ea + 1 | 0;
                                                if (Ma) {
                                                    Ea = La;
                                                    break
                                                }
                                                Ea = (Ea | 0) > 3 ? 4 : La;
                                                break b
                                            }
                                        while (0);
                                        if (!((Ma | 0) != 0 & (Ga | 0) == 0)) break;
                                        La = a[ua >> 0] | 0;
                                        Ga = (La & 255) >>> 2;
                                        if ((Ja | 0) >= (3 << Ga | 0)) {
                                            a[ua >> 0] = La + 1 << 24 >> 24;
                                            Ga = 1;
                                            break
                                        }
                                        if ((Ja << 1 | 0) >= (1 << Ga | 0) | La << 24 >> 24 == 0) {
                                            Ga = 1;
                                            break
                                        }
                                        a[ua >> 0] = La + -1 << 24 >> 24;
                                        Ga = 1
                                    }
                                while (0);
                                do
                                    if (!((a[(c[ga >> 2] | 0) + 4 >> 0] | 0) == 0 | sa)) {
                                        Da = ae(Ha | 0, Ia | 0, Da | 0, 0) | 0;
                                        if (Ba << 24 >> 24 != qa << 24 >> 24) break;
                                        Na = (Da & 1 | 0) == 0;
                                        Ma = $d(0, 0, Ha | 0, Ia | 0) | 0;
                                        Ha = Na ? Ha : Ma;
                                        Ia = Na ? Ia : D
                                    }
                                while (0);
                                Na = (za & 32768 | 0) == 0;
                                Ba = $d(0, 0, Ha | 0, Ia | 0) | 0;
                                Ba = Na ? Ha : Ba;
                                Ha = Na ? Ia : D;
                                za = za << 1 & 131070;
                                Ia = Ba & 65535;
                                do
                                    if (!(a[z >> 0] | 0)) {
                                        do
                                            if (!((a[(c[n >> 2] | 0) + 634 >> 0] | 0) == 0 | ha)) {
                                                if (!((xa | ya | 0) != 0 | k)) {
                                                    Aa = ia;
                                                    break
                                                }
                                                if ((j | 0) == 3) Aa = (xa << 3) + ya | 0;
                                                else if ((j | 0) == 4) Aa = (xa >>> 1 << 3) + (ya >>> 1) | 0;
                                                else if ((j | 0) == 5) Aa = (xa >>> 2 << 3) + (ya >>> 2) | 0;
                                                else Aa = (xa << 2) + ya | 0;
                                                Aa = d[C + Aa >> 0] | 0
                                            }
                                        while (0);
                                        Ba = ke(Ba | 0, Ha | 0, B | 0, Y | 0) | 0;
                                        Ba = ke(Ba | 0, D | 0, Aa | 0, ((Aa | 0) < 0) << 31 >> 31 | 0) | 0;
                                        Ba = ae(Ba | 0, D | 0, A | 0, X | 0) | 0;
                                        Ba = _d(Ba | 0, D | 0, E | 0) | 0;
                                        Ha = D;
                                        if ((Ha | 0) < 0) {
                                            Ia = (Ba & -32768 | 0) == -32768 & (Ha & 268435455 | 0) == 268435455 ? Ba & 65535 : -32768;
                                            break
                                        } else {
                                            Ia = Ha >>> 0 > 0 | (Ha | 0) == 0 & Ba >>> 0 > 32767 ? 32767 : Ba & 65535;
                                            break
                                        }
                                    }
                                while (0);
                                b[q + ((xa << j) + ya << 1) >> 1] = Ia;
                                wa = wa + 1 | 0;
                                if ((wa | 0) >= (na | 0)) {
                                    xa = Aa;
                                    break a
                                }
                                Ba = a[u + wa >> 0] | 0
                            }
                        }
                    while (0);
                    if (la) ka = ka + -1 | 0;
                    else break
                }
            }
            do
                if (a[z >> 0] | 0) {
                    if ((c[(c[n >> 2] | 0) + 13104 >> 2] | 0) != 0 ? (w & -17 | 0) == 10 : 0) Fa[c[f + 2632 >> 2] & 7](q, j & 65535, (w | 0) == 26 & 1)
                } else {
                    if (F) {
                        s = c[n >> 2] | 0;
                        if ((c[s + 13096 >> 2] | 0) != 0 & (j | 0) == 2 ? (c[p + 31244 >> 2] | 0) == 1 : 0) {
                            t = 0;
                            do {
                                La = q + (15 - t << 1) | 0;
                                Ma = b[La >> 1] | 0;
                                Na = q + (t << 1) | 0;
                                b[La >> 1] = b[Na >> 1] | 0;
                                b[Na >> 1] = Ma;
                                t = t + 1 | 0
                            } while ((t | 0) != 8)
                        }
                        t = j & 65535;
                        Fa[c[f + 2628 >> 2] & 7](q, t, c[s + 52 >> 2] | 0);
                        if (!(c[(c[n >> 2] | 0) + 13104 >> 2] | 0)) break;
                        if ((c[p + 31244 >> 2] | 0) != 1) break;
                        if ((w & -17 | 0) != 10) break;
                        Fa[c[f + 2632 >> 2] & 7](q, t, (w | 0) == 26 & 1);
                        break
                    }
                    if (y & (c[p + 31244 >> 2] | 0) == 1 & (j | 0) == 2) {
                        Ca[c[f + 2636 >> 2] & 7](q, c[(c[n >> 2] | 0) + 52 >> 2] | 0);
                        break
                    }
                    s = (G | 0) > (H | 0) ? G : H;
                    if (!s) {
                        Ca[c[f + (j + -2 << 2) + 2656 >> 2] & 7](q, c[(c[n >> 2] | 0) + 52 >> 2] | 0);
                        break
                    }
                    t = H + 4 + G | 0;
                    do
                        if ((s | 0) >= 4) {
                            if ((s | 0) < 8) {
                                t = (t | 0) < 8 ? t : 8;
                                break
                            }
                            if ((s | 0) < 12) t = (t | 0) < 24 ? t : 24
                        } else t = (t | 0) < 4 ? t : 4;
                    while (0);
                    Fa[c[f + (j + -2 << 2) + 2640 >> 2] & 7](q, t, c[(c[n >> 2] | 0) + 52 >> 2] | 0)
                }
            while (0);
            if (!(a[p + 304 >> 0] | 0)) {
                Ma = j + -2 | 0;
                Ma = f + (Ma << 2) + 2612 | 0;
                Ma = c[Ma >> 2] | 0;
                Na = c[n >> 2] | 0;
                Na = Na + 52 | 0;
                Na = c[Na >> 2] | 0;
                Ka[Ma & 7](g, q, m, Na);
                i = o;
                return
            }
            if ((r | 0) <= 0) {
                Ma = j + -2 | 0;
                Ma = f + (Ma << 2) + 2612 | 0;
                Ma = c[Ma >> 2] | 0;
                Na = c[n >> 2] | 0;
                Na = Na + 52 | 0;
                Na = c[Na >> 2] | 0;
                Ka[Ma & 7](g, q, m, Na);
                i = o;
                return
            }
            p = c[p + 284 >> 2] | 0;
            s = 0;
            do {
                Na = q + (s << 1) | 0;
                b[Na >> 1] = (($(b[h + (s << 1) >> 1] | 0, p) | 0) >>> 3) + (e[Na >> 1] | 0);
                s = s + 1 | 0
            } while ((s | 0) != (r | 0));
            Ma = j + -2 | 0;
            Ma = f + (Ma << 2) + 2612 | 0;
            Ma = c[Ma >> 2] | 0;
            Na = c[n >> 2] | 0;
            Na = Na + 52 | 0;
            Na = c[Na >> 2] | 0;
            Ka[Ma & 7](g, q, m, Na);
            i = o;
            return
        }

        function yb(a) {
            a = a | 0;
            var b = 0,
                e = 0,
                f = 0;
            b = i;
            f = a + 16 | 0;
            e = c[f >> 2] | 0;
            c[a >> 2] = (c[a >> 2] | 0) + -65535 + ((d[e + 1 >> 0] | 0) << 1 | (d[e >> 0] | 0) << 9);
            if (e >>> 0 >= (c[a + 20 >> 2] | 0) >>> 0) {
                i = b;
                return
            }
            c[f >> 2] = e + 2;
            i = b;
            return
        }

        function zb(b, d, e, f) {
            b = b | 0;
            d = d | 0;
            e = e | 0;
            f = f | 0;
            var g = 0,
                h = 0,
                j = 0,
                k = 0,
                l = 0,
                m = 0,
                n = 0,
                o = 0,
                p = 0,
                q = 0;
            f = i;
            h = b + 136 | 0;
            n = c[h >> 2] | 0;
            g = b + 200 | 0;
            j = c[g >> 2] | 0;
            m = c[j + 13080 >> 2] | 0;
            q = (1 << m) + -1 | 0;
            m = -1 << m - (c[(c[b + 204 >> 2] | 0) + 24 >> 2] | 0);
            o = m & d;
            p = m & e;
            k = c[j + 13140 >> 2] | 0;
            j = c[j + 13064 >> 2] | 0;
            l = o >> j;
            j = p >> j;
            if (!(q & d)) o = 0;
            else o = (o & q | 0) != 0;
            if (!(q & e)) p = 0;
            else p = (p & q | 0) != 0;
            q = n + 203 | 0;
            if ((a[q >> 0] | 0) == 0 ? (m & (e | d) | 0) != 0 : 0) d = c[n + 276 >> 2] | 0;
            else {
                a[q >> 0] = (a[n + 300 >> 0] | 0) == 0 & 1;
                d = a[b + 2112 >> 0] | 0
            }
            if (o) {
                e = l + -1 + ($(j, k) | 0) | 0;
                e = a[(c[b + 4316 >> 2] | 0) + e >> 0] | 0
            } else e = d;
            if (p) {
                d = ($(j + -1 | 0, k) | 0) + l | 0;
                d = a[(c[b + 4316 >> 2] | 0) + d >> 0] | 0
            }
            b = e + 1 + d >> 1;
            h = c[h >> 2] | 0;
            j = c[h + 280 >> 2] | 0;
            if (!j) {
                a[h + 272 >> 0] = b;
                i = f;
                return
            }
            g = c[(c[g >> 2] | 0) + 13192 >> 2] | 0;
            b = j + 52 + b + (g << 1) | 0;
            if ((b | 0) > 0) j = b;
            else j = -52 - g + 1 + b | 0;
            a[h + 272 >> 0] = b - g - j + ((j | 0) % (g + 52 | 0) | 0);
            i = f;
            return
        }

        function Ab(b, d, e, f) {
            b = b | 0;
            d = d | 0;
            e = e | 0;
            f = f | 0;
            var g = 0,
                h = 0,
                j = 0,
                k = 0,
                l = 0,
                m = 0,
                n = 0,
                o = 0;
            g = i;
            j = c[b + 136 >> 2] | 0;
            k = b + 200 | 0;
            do
                if ((e | 0) > 0 & (e & 7 | 0) == 0) {
                    if (((a[b + 2062 >> 0] | 0) == 0 ? (c[j + 31312 >> 2] & 4 | 0) != 0 : 0) ? ((e | 0) % (1 << c[(c[k >> 2] | 0) + 13080 >> 2] | 0) | 0 | 0) == 0 : 0) break;
                    if (((a[(c[b + 204 >> 2] | 0) + 53 >> 0] | 0) == 0 ? (c[j + 31312 >> 2] & 8 | 0) != 0 : 0) ? ((e | 0) % (1 << c[(c[k >> 2] | 0) + 13080 >> 2] | 0) | 0 | 0) == 0 : 0) break;
                    h = 1 << f;
                    if ((h | 0) > 0) {
                        l = b + 2596 | 0;
                        m = b + 4320 | 0;
                        n = 0;
                        do {
                            o = n + d + ($(c[l >> 2] | 0, e) | 0) >> 2;
                            a[(c[m >> 2] | 0) + o >> 0] = 2;
                            n = n + 4 | 0
                        } while ((n | 0) < (h | 0))
                    }
                }
            while (0);
            if (!((d | 0) > 0 & (d & 7 | 0) == 0)) {
                i = g;
                return
            }
            if (((a[b + 2062 >> 0] | 0) == 0 ? (c[j + 31312 >> 2] & 1 | 0) != 0 : 0) ? ((d | 0) % (1 << c[(c[k >> 2] | 0) + 13080 >> 2] | 0) | 0 | 0) == 0 : 0) {
                i = g;
                return
            }
            if (((a[(c[b + 204 >> 2] | 0) + 53 >> 0] | 0) == 0 ? (c[j + 31312 >> 2] & 2 | 0) != 0 : 0) ? ((d | 0) % (1 << c[(c[k >> 2] | 0) + 13080 >> 2] | 0) | 0 | 0) == 0 : 0) {
                i = g;
                return
            }
            h = 1 << f;
            if ((h | 0) <= 0) {
                i = g;
                return
            }
            j = b + 2596 | 0;
            b = b + 4324 | 0;
            k = 0;
            do {
                o = ($(c[j >> 2] | 0, k + e | 0) | 0) + d >> 2;
                a[(c[b >> 2] | 0) + o >> 0] = 2;
                k = k + 4 | 0
            } while ((k | 0) < (h | 0));
            i = g;
            return
        }

        function Bb(e, f, g, h) {
            e = e | 0;
            f = f | 0;
            g = g | 0;
            h = h | 0;
            var j = 0,
                k = 0,
                l = 0,
                m = 0,
                n = 0,
                o = 0,
                p = 0,
                q = 0,
                r = 0,
                s = 0,
                t = 0,
                u = 0,
                v = 0,
                w = 0,
                x = 0,
                y = 0,
                z = 0,
                A = 0,
                B = 0,
                C = 0,
                D = 0,
                E = 0,
                F = 0,
                G = 0,
                H = 0,
                I = 0,
                J = 0,
                K = 0,
                L = 0,
                M = 0,
                N = 0,
                O = 0,
                P = 0,
                Q = 0,
                R = 0,
                S = 0,
                T = 0,
                U = 0,
                V = 0,
                W = 0,
                X = 0,
                Y = 0,
                Z = 0,
                _ = 0,
                aa = 0,
                ba = 0,
                ca = 0,
                da = 0,
                ea = 0;
            j = i;
            i = i + 32 | 0;
            o = j + 8 | 0;
            x = j;
            n = j + 18 | 0;
            s = j + 16 | 0;
            l = e + 200 | 0;
            K = c[l >> 2] | 0;
            v = c[K + 13120 >> 2] | 0;
            k = (v - h | 0) <= (f | 0);
            b[n >> 1] = 0;
            b[s >> 1] = 0;
            w = c[K + 13080 >> 2] | 0;
            u = 1 << w;
            w = ($(g >> w, c[K + 13128 >> 2] | 0) | 0) + (f >> w) | 0;
            t = c[e + 2508 >> 2] | 0;
            m = c[t + (w << 3) + 4 >> 2] | 0;
            y = c[t + (w << 3) >> 2] | 0;
            if ((c[K + 68 >> 2] | 0) != 0 ? (a[K + 13056 >> 0] | 0) != 0 : 0) p = 1;
            else p = (a[(c[e + 204 >> 2] | 0) + 40 >> 0] | 0) != 0;
            r = c[K + 52 >> 2] | 0;
            q = (f | 0) != 0;
            if (q) {
                w = w + -1 | 0;
                z = c[t + (w << 3) >> 2] | 0;
                w = c[t + (w << 3) + 4 >> 2] | 0
            } else {
                z = 0;
                w = 0
            }
            t = u + f | 0;
            t = (t | 0) > (v | 0) ? v : t;
            u = u + g | 0;
            A = c[K + 13124 >> 2] | 0;
            u = (u | 0) > (A | 0) ? A : u;
            A = (t | 0) == (v | 0) ? t : t + -8 | 0;
            v = (u | 0) > (g | 0);
            if (v) {
                K = q ? f : 8;
                N = (K | 0) < (t | 0);
                Q = q ? f + -8 | 0 : 0;
                F = e + 2596 | 0;
                P = e + 4320 | 0;
                I = e + 4316 | 0;
                C = x + 4 | 0;
                D = e + 160 | 0;
                E = n + 1 | 0;
                R = s + 1 | 0;
                L = e + 4300 | 0;
                M = e + 4284 | 0;
                J = e + 4324 | 0;
                G = e + 4304 | 0;
                H = e + 4288 | 0;
                B = (Q | 0) >= (A | 0);
                U = y;
                T = m;
                O = g;
                do {
                    if (N) {
                        W = O + 4 | 0;
                        X = T + -2 & -2;
                        V = K;
                        do {
                            _ = c[F >> 2] | 0;
                            da = ($(_, O) | 0) + V >> 2;
                            aa = c[J >> 2] | 0;
                            da = a[aa + da >> 0] | 0;
                            ca = da & 255;
                            _ = a[aa + (($(_, W) | 0) + V >> 2) >> 0] | 0;
                            aa = _ & 255;
                            da = da << 24 >> 24 != 0;
                            _ = _ << 24 >> 24 == 0;
                            do
                                if (!(_ & (da ^ 1))) {
                                    S = V + -1 | 0;
                                    Y = c[l >> 2] | 0;
                                    ba = c[Y + 13064 >> 2] | 0;
                                    Z = $(O >> ba, c[Y + 13140 >> 2] | 0) | 0;
                                    ea = c[I >> 2] | 0;
                                    ba = (a[ea + (Z + (S >> ba)) >> 0] | 0) + 1 + (a[ea + (Z + (V >> ba)) >> 0] | 0) >> 1;
                                    Z = ba + U | 0;
                                    if ((Z | 0) < 0) Z = 0;
                                    else Z = (Z | 0) > 51 ? 51 : Z;
                                    Z = d[1280 + Z >> 0] | 0;
                                    if (da) {
                                        ca = (ca << 1) + X + ba | 0;
                                        if ((ca | 0) < 0) ca = 0;
                                        else ca = (ca | 0) > 53 ? 53 : ca;
                                        ca = d[1336 + ca >> 0] | 0
                                    } else ca = 0;
                                    c[x >> 2] = ca;
                                    if (_) _ = 0;
                                    else {
                                        _ = (aa << 1) + X + ba | 0;
                                        if ((_ | 0) < 0) _ = 0;
                                        else _ = (_ | 0) > 53 ? 53 : _;
                                        _ = d[1336 + _ >> 0] | 0
                                    }
                                    c[C >> 2] = _;
                                    da = c[D >> 2] | 0;
                                    _ = c[da + 32 >> 2] | 0;
                                    ea = $(_, O) | 0;
                                    Y = (c[da >> 2] | 0) + ((V << c[Y + 56 >> 2]) + ea) | 0;
                                    if (p) {
                                        a[n >> 0] = Gb(e, S, O) | 0;
                                        a[E >> 0] = Gb(e, S, W) | 0;
                                        a[s >> 0] = Gb(e, V, O) | 0;
                                        a[R >> 0] = Gb(e, V, W) | 0;
                                        za[c[G >> 2] & 7](Y, _, Z, x, n, s, r);
                                        break
                                    } else {
                                        za[c[H >> 2] & 7](Y, _, Z, x, n, s, r);
                                        break
                                    }
                                }
                            while (0);
                            V = V + 8 | 0
                        } while ((V | 0) < (t | 0))
                    }
                    if (!((O | 0) == 0 | B)) {
                        S = O + -1 | 0;
                        W = T;
                        T = Q;
                        do {
                            Z = $(c[F >> 2] | 0, O) | 0;
                            _ = c[P >> 2] | 0;
                            ba = a[_ + (Z + T >> 2) >> 0] | 0;
                            ca = ba & 255;
                            V = T + 4 | 0;
                            Z = a[_ + (Z + V >> 2) >> 0] | 0;
                            _ = Z & 255;
                            ba = ba << 24 >> 24 != 0;
                            Z = Z << 24 >> 24 == 0;
                            do
                                if (!(Z & (ba ^ 1))) {
                                    X = c[l >> 2] | 0;
                                    W = c[X + 13064 >> 2] | 0;
                                    aa = T >> W;
                                    U = c[X + 13140 >> 2] | 0;
                                    ea = ($(S >> W, U) | 0) + aa | 0;
                                    Y = c[I >> 2] | 0;
                                    aa = (a[Y + ea >> 0] | 0) + 1 + (a[Y + (($(O >> W, U) | 0) + aa) >> 0] | 0) >> 1;
                                    U = (T | 0) >= (f | 0);
                                    W = U ? m : w;
                                    U = U ? y : z;
                                    Y = aa + U | 0;
                                    if ((Y | 0) < 0) Y = 0;
                                    else Y = (Y | 0) > 51 ? 51 : Y;
                                    Y = d[1280 + Y >> 0] | 0;
                                    if (ba) {
                                        ba = (ca << 1) + (W + -2 & -2) + aa | 0;
                                        if ((ba | 0) < 0) ba = 0;
                                        else ba = (ba | 0) > 53 ? 53 : ba;
                                        ba = d[1336 + ba >> 0] | 0
                                    } else ba = 0;
                                    c[x >> 2] = ba;
                                    if (Z) Z = 0;
                                    else {
                                        Z = (_ << 1) + (W + -2 & -2) + aa | 0;
                                        if ((Z | 0) < 0) Z = 0;
                                        else Z = (Z | 0) > 53 ? 53 : Z;
                                        Z = d[1336 + Z >> 0] | 0
                                    }
                                    c[C >> 2] = Z;
                                    da = c[D >> 2] | 0;
                                    Z = c[da + 32 >> 2] | 0;
                                    ea = $(Z, O) | 0;
                                    X = (c[da >> 2] | 0) + ((T << c[X + 56 >> 2]) + ea) | 0;
                                    if (p) {
                                        a[n >> 0] = Gb(e, T, S) | 0;
                                        a[E >> 0] = Gb(e, V, S) | 0;
                                        a[s >> 0] = Gb(e, T, O) | 0;
                                        a[R >> 0] = Gb(e, V, O) | 0;
                                        za[c[L >> 2] & 7](X, Z, Y, x, n, s, r);
                                        break
                                    } else {
                                        za[c[M >> 2] & 7](X, Z, Y, x, n, s, r);
                                        break
                                    }
                                }
                            while (0);
                            T = T + 8 | 0
                        } while ((T | 0) < (A | 0));
                        T = W
                    }
                    O = O + 8 | 0
                } while ((O | 0) < (u | 0));
                K = c[l >> 2] | 0
            } else T = m;
            if (c[K + 4 >> 2] | 0) {
                D = q ? w : m;
                G = e + 2596 | 0;
                F = e + 4320 | 0;
                w = e + 4316 | 0;
                y = o + 4 | 0;
                x = e + 160 | 0;
                C = n + 1 | 0;
                B = s + 1 | 0;
                E = e + 4308 | 0;
                H = e + 4292 | 0;
                I = e + 4324 | 0;
                A = e + 4312 | 0;
                z = e + 4296 | 0;
                J = 1;
                do {
                    P = 1 << c[K + (J << 2) + 13168 >> 2];
                    Q = 1 << c[K + (J << 2) + 13180 >> 2];
                    if (v) {
                        O = P << 3;
                        M = q ? f : O;
                        L = (M | 0) < (t | 0);
                        K = Q << 3;
                        N = q ? f - O | 0 : 0;
                        P = P << 2;
                        Q = Q << 2;
                        R = g;
                        do {
                            if (L) {
                                S = R + Q | 0;
                                U = M;
                                do {
                                    X = c[G >> 2] | 0;
                                    Z = ($(X, R) | 0) + U >> 2;
                                    ea = c[I >> 2] | 0;
                                    Z = (a[ea + Z >> 0] | 0) == 2;
                                    X = (a[ea + (($(X, S) | 0) + U >> 2) >> 0] | 0) == 2;
                                    do
                                        if (Z | X) {
                                            V = U + -1 | 0;
                                            W = c[l >> 2] | 0;
                                            ea = c[W + 13064 >> 2] | 0;
                                            _ = V >> ea;
                                            Y = c[W + 13140 >> 2] | 0;
                                            ba = $(R >> ea, Y) | 0;
                                            aa = c[w >> 2] | 0;
                                            ca = U >> ea;
                                            Y = $(S >> ea, Y) | 0;
                                            Y = (a[aa + (Y + _) >> 0] | 0) + 1 + (a[aa + (Y + ca) >> 0] | 0) >> 1;
                                            if (Z) Z = Hb(e, (a[aa + (ba + ca) >> 0] | 0) + 1 + (a[aa + (ba + _) >> 0] | 0) >> 1, J, T) | 0;
                                            else Z = 0;
                                            c[o >> 2] = Z;
                                            if (X) X = Hb(e, Y, J, T) | 0;
                                            else X = 0;
                                            c[y >> 2] = X;
                                            da = c[x >> 2] | 0;
                                            X = c[da + (J << 2) + 32 >> 2] | 0;
                                            ea = $(X, R >> c[W + (J << 2) + 13180 >> 2]) | 0;
                                            W = (c[da + (J << 2) >> 2] | 0) + ((U >> c[W + (J << 2) + 13168 >> 2] << c[W + 56 >> 2]) + ea) | 0;
                                            if (p) {
                                                a[n >> 0] = Gb(e, V, R) | 0;
                                                a[C >> 0] = Gb(e, V, S) | 0;
                                                a[s >> 0] = Gb(e, U, R) | 0;
                                                a[B >> 0] = Gb(e, U, S) | 0;
                                                Ha[c[A >> 2] & 3](W, X, o, n, s, r);
                                                break
                                            } else {
                                                Ha[c[z >> 2] & 3](W, X, o, n, s, r);
                                                break
                                            }
                                        }
                                    while (0);
                                    U = U + O | 0
                                } while ((U | 0) < (t | 0))
                            }
                            if (R) {
                                V = t - ((t | 0) == (c[(c[l >> 2] | 0) + 13120 >> 2] | 0) ? 0 : O) | 0;
                                if ((N | 0) < (V | 0)) {
                                    U = R + -1 | 0;
                                    T = N;
                                    do {
                                        X = $(c[G >> 2] | 0, R) | 0;
                                        ea = c[F >> 2] | 0;
                                        S = T + P | 0;
                                        Y = (a[ea + (X + T >> 2) >> 0] | 0) == 2;
                                        X = (a[ea + (X + S >> 2) >> 0] | 0) == 2;
                                        do
                                            if (Y | X) {
                                                if (Y) {
                                                    ea = c[l >> 2] | 0;
                                                    da = c[ea + 13064 >> 2] | 0;
                                                    Z = T >> da;
                                                    ea = c[ea + 13140 >> 2] | 0;
                                                    ba = ($(U >> da, ea) | 0) + Z | 0;
                                                    ca = c[w >> 2] | 0;
                                                    Z = (a[ca + ba >> 0] | 0) + 1 + (a[ca + (($(R >> da, ea) | 0) + Z) >> 0] | 0) >> 1
                                                } else Z = 0;
                                                if (X) {
                                                    ea = c[l >> 2] | 0;
                                                    da = c[ea + 13064 >> 2] | 0;
                                                    W = S >> da;
                                                    ea = c[ea + 13140 >> 2] | 0;
                                                    ba = ($(U >> da, ea) | 0) + W | 0;
                                                    ca = c[w >> 2] | 0;
                                                    W = (a[ca + ba >> 0] | 0) + 1 + (a[ca + (($(R >> da, ea) | 0) + W) >> 0] | 0) >> 1
                                                } else W = 0;
                                                if (Y) Y = Hb(e, Z, J, D) | 0;
                                                else Y = 0;
                                                c[o >> 2] = Y;
                                                if (X) W = Hb(e, W, J, m) | 0;
                                                else W = 0;
                                                c[y >> 2] = W;
                                                ea = c[l >> 2] | 0;
                                                da = c[x >> 2] | 0;
                                                X = c[da + (J << 2) + 32 >> 2] | 0;
                                                W = $(X, R >> c[ea + 13184 >> 2]) | 0;
                                                W = (c[da + (J << 2) >> 2] | 0) + ((T >> c[ea + 13172 >> 2] << c[ea + 56 >> 2]) + W) | 0;
                                                if (p) {
                                                    a[n >> 0] = Gb(e, T, U) | 0;
                                                    a[C >> 0] = Gb(e, S, U) | 0;
                                                    a[s >> 0] = Gb(e, T, R) | 0;
                                                    a[B >> 0] = Gb(e, S, R) | 0;
                                                    Ha[c[E >> 2] & 3](W, X, o, n, s, r);
                                                    break
                                                } else {
                                                    Ha[c[H >> 2] & 3](W, X, o, n, s, r);
                                                    break
                                                }
                                            }
                                        while (0);
                                        T = T + O | 0
                                    } while ((T | 0) < (V | 0));
                                    T = D
                                } else T = D
                            }
                            R = R + K | 0
                        } while ((R | 0) < (u | 0))
                    }
                    J = J + 1 | 0;
                    K = c[l >> 2] | 0
                } while ((J | 0) != 3)
            }
            if (!(a[K + 12941 >> 0] | 0)) {
                if ((a[e + 140 >> 0] & 1) == 0 | k ^ 1) {
                    i = j;
                    return
                }
                i = j;
                return
            }
            n = (c[K + 13124 >> 2] | 0) - h | 0;
            l = (g | 0) == 0;
            m = (f | 0) == 0;
            if (!(l | m)) Cb(e, f - h | 0, g - h | 0);
            n = (n | 0) > (g | 0);
            if (!(m | n)) Cb(e, f - h | 0, g);
            k = k ^ 1;
            !(l | k) ? (Cb(e, f, g - h | 0), (a[e + 140 >> 0] & 1) != 0) : 0;
            if (n | k) {
                i = j;
                return
            }
            Cb(e, f, g);
            if (!(a[e + 140 >> 0] & 1)) {
                i = j;
                return
            }
            i = j;
            return
        }

        function Cb(e, f, g) {
            e = e | 0;
            f = f | 0;
            g = g | 0;
            var h = 0,
                j = 0,
                k = 0,
                l = 0,
                m = 0,
                n = 0,
                o = 0,
                p = 0,
                q = 0,
                r = 0,
                s = 0,
                t = 0,
                u = 0,
                v = 0,
                w = 0,
                x = 0,
                y = 0,
                z = 0,
                A = 0,
                B = 0,
                C = 0,
                D = 0,
                E = 0,
                F = 0,
                G = 0,
                H = 0,
                I = 0,
                J = 0,
                K = 0,
                L = 0,
                M = 0,
                N = 0,
                O = 0,
                P = 0,
                Q = 0,
                R = 0,
                S = 0,
                T = 0,
                U = 0,
                V = 0,
                W = 0,
                X = 0,
                Y = 0,
                Z = 0,
                _ = 0,
                aa = 0,
                ba = 0,
                ca = 0,
                da = 0,
                ea = 0,
                fa = 0,
                ga = 0,
                ha = 0,
                ia = 0,
                ja = 0,
                ka = 0,
                la = 0,
                ma = 0,
                na = 0,
                oa = 0,
                pa = 0;
            h = i;
            i = i + 48 | 0;
            l = h + 24 | 0;
            r = h + 42 | 0;
            s = h + 40 | 0;
            p = h + 16 | 0;
            k = h + 8 | 0;
            t = h;
            o = e + 200 | 0;
            S = c[o >> 2] | 0;
            y = c[S + 13080 >> 2] | 0;
            j = f >> y;
            y = g >> y;
            G = S + 13128 | 0;
            n = ($(y, c[G >> 2] | 0) | 0) + j | 0;
            M = c[e + 204 >> 2] | 0;
            L = M + 1668 | 0;
            N = c[(c[L >> 2] | 0) + (n << 2) >> 2] | 0;
            A = e + 2504 | 0;
            m = c[A >> 2] | 0;
            q = m + (n * 148 | 0) | 0;
            b[r >> 1] = 0;
            b[s >> 1] = 0;
            c[p >> 2] = 0;
            F = ($(c[G >> 2] | 0, y) | 0) + j | 0;
            F = a[(c[e + 4352 >> 2] | 0) + F >> 0] | 0;
            if ((a[M + 42 >> 0] | 0) != 0 ? (a[M + 53 >> 0] | 0) == 0 : 0) {
                R = 1;
                O = 1
            } else {
                R = F << 24 >> 24 == 0 & 1;
                O = 0
            }
            D = (j | 0) == 0;
            c[l >> 2] = D & 1;
            I = (y | 0) == 0;
            u = l + 4 | 0;
            c[u >> 2] = I & 1;
            H = (j | 0) == ((c[G >> 2] | 0) + -1 | 0);
            z = l + 8 | 0;
            c[z >> 2] = H & 1;
            E = (y | 0) == ((c[S + 13132 >> 2] | 0) + -1 | 0);
            x = l + 12 | 0;
            c[x >> 2] = E & 1;
            if (R << 24 >> 24) {
                if (D) J = 0;
                else {
                    if (O) {
                        J = c[M + 1676 >> 2] | 0;
                        J = (c[J + (N << 2) >> 2] | 0) != (c[J + (c[(c[L >> 2] | 0) + (n + -1 << 2) >> 2] << 2) >> 2] | 0) & 1
                    } else J = 0;
                    if (F << 24 >> 24 == 0 ? (pa = $(c[G >> 2] | 0, y) | 0, oa = c[e + 4328 >> 2] | 0, (c[oa + (pa + j << 2) >> 2] | 0) != (c[oa + (j + -1 + pa << 2) >> 2] | 0)) : 0) K = 1;
                    else K = J;
                    a[r >> 0] = K
                }
                if (H) K = 0;
                else {
                    if (O) {
                        K = c[M + 1676 >> 2] | 0;
                        K = (c[K + (N << 2) >> 2] | 0) != (c[K + (c[(c[L >> 2] | 0) + (n + 1 << 2) >> 2] << 2) >> 2] | 0) & 1
                    } else K = 0;
                    if (F << 24 >> 24 == 0 ? (pa = $(c[G >> 2] | 0, y) | 0, oa = c[e + 4328 >> 2] | 0, (c[oa + (pa + j << 2) >> 2] | 0) != (c[oa + (j + 1 + pa << 2) >> 2] | 0)) : 0) P = 1;
                    else P = K;
                    a[r + 1 >> 0] = P
                }
                if (I) P = 0;
                else {
                    if (O) {
                        P = c[M + 1676 >> 2] | 0;
                        P = (c[P + (N << 2) >> 2] | 0) != (c[P + (c[(c[L >> 2] | 0) + (n - (c[G >> 2] | 0) << 2) >> 2] << 2) >> 2] | 0) & 1
                    } else P = 0;
                    if (F << 24 >> 24 == 0 ? (pa = c[G >> 2] | 0, na = ($(pa, y) | 0) + j | 0, oa = c[e + 4328 >> 2] | 0, (c[oa + (na << 2) >> 2] | 0) != (c[oa + (($(pa, y + -1 | 0) | 0) + j << 2) >> 2] | 0)) : 0) Q = 1;
                    else Q = P;
                    a[s >> 0] = Q
                }
                if (E) L = 0;
                else {
                    if (O) {
                        pa = c[M + 1676 >> 2] | 0;
                        L = (c[pa + (N << 2) >> 2] | 0) != (c[pa + (c[(c[L >> 2] | 0) + ((c[G >> 2] | 0) + n << 2) >> 2] << 2) >> 2] | 0) & 1
                    } else L = 0;
                    if (F << 24 >> 24 == 0 ? (pa = c[G >> 2] | 0, na = ($(pa, y) | 0) + j | 0, oa = c[e + 4328 >> 2] | 0, (c[oa + (na << 2) >> 2] | 0) != (c[oa + (($(pa, y + 1 | 0) | 0) + j << 2) >> 2] | 0)) : 0) M = 1;
                    else M = L;
                    a[s + 1 >> 0] = M
                }
                if (!D)
                    if (I) B = 47;
                    else {
                        if (!(F << 24 >> 24)) {
                            pa = c[G >> 2] | 0;
                            na = ($(pa, y) | 0) + j | 0;
                            oa = c[e + 4328 >> 2] | 0;
                            if (J << 24 >> 24 == 0 ? (c[oa + (na << 2) >> 2] | 0) == (c[oa + (j + -1 + ($(pa, y + -1 | 0) | 0) << 2) >> 2] | 0) : 0) B = 38;
                            else M = 1
                        } else if (!(J << 24 >> 24)) B = 38;
                        else M = 1;
                        if ((B | 0) == 38) M = P << 24 >> 24 != 0 & 1;
                        a[p >> 0] = M;
                        B = 40
                    } else B = 40;
                if ((B | 0) == 40)
                    if (!I) {
                        if (!H) {
                            if (!(F << 24 >> 24)) {
                                pa = c[G >> 2] | 0;
                                na = ($(pa, y) | 0) + j | 0;
                                oa = c[e + 4328 >> 2] | 0;
                                if (K << 24 >> 24 == 0 ? (c[oa + (na << 2) >> 2] | 0) == (c[oa + (j + 1 + ($(pa, y + -1 | 0) | 0) << 2) >> 2] | 0) : 0) B = 45;
                                else I = 1
                            } else if (!(K << 24 >> 24)) B = 45;
                            else I = 1;
                            if ((B | 0) == 45) I = P << 24 >> 24 != 0 & 1;
                            a[p + 1 >> 0] = I;
                            B = 47
                        }
                    } else B = 47;
                if ((B | 0) == 47 ? !(H | E) : 0) {
                    if (!(F << 24 >> 24)) {
                        pa = c[G >> 2] | 0;
                        na = ($(pa, y) | 0) + j | 0;
                        oa = c[e + 4328 >> 2] | 0;
                        if (K << 24 >> 24 == 0 ? (c[oa + (na << 2) >> 2] | 0) == (c[oa + (j + 1 + ($(pa, y + 1 | 0) | 0) << 2) >> 2] | 0) : 0) B = 51;
                        else H = 1
                    } else if (!(K << 24 >> 24)) B = 51;
                    else H = 1;
                    if ((B | 0) == 51) H = L << 24 >> 24 != 0 & 1;
                    a[p + 2 >> 0] = H
                }
                if (!(D | E)) {
                    if (!(F << 24 >> 24)) {
                        pa = c[G >> 2] | 0;
                        na = ($(pa, y) | 0) + j | 0;
                        oa = c[e + 4328 >> 2] | 0;
                        if (J << 24 >> 24 == 0 ? (c[oa + (na << 2) >> 2] | 0) == (c[oa + (j + -1 + ($(pa, y + 1 | 0) | 0) << 2) >> 2] | 0) : 0) B = 57;
                        else D = 1
                    } else if (!(J << 24 >> 24)) B = 57;
                    else D = 1;
                    if ((B | 0) == 57) D = L << 24 >> 24 != 0 & 1;
                    a[p + 3 >> 0] = D
                }
            }
            N = (c[S + 4 >> 2] | 0) != 0 ? 3 : 1;
            E = e + 160 | 0;
            D = e + 168 | 0;
            F = e + 2672 | 0;
            P = y << 1;
            H = P + -1 | 0;
            G = k + 4 | 0;
            O = y + -1 | 0;
            J = j + 1 | 0;
            L = j + -1 | 0;
            P = P + 2 | 0;
            Q = t + 4 | 0;
            M = y + 1 | 0;
            I = j << 1;
            K = I + -1 | 0;
            I = I + 2 | 0;
            R = e + ((R & 255) << 2) + 2676 | 0;
            na = S;
            _ = 0;
            while (1) {
                ka = c[na + (_ << 2) + 13168 >> 2] | 0;
                V = f >> ka;
                ha = c[na + (_ << 2) + 13180 >> 2] | 0;
                aa = g >> ha;
                ba = c[E >> 2] | 0;
                W = c[ba + (_ << 2) + 32 >> 2] | 0;
                S = 1 << c[na + 13080 >> 2];
                Z = S >> ka;
                Y = S >> ha;
                ka = c[na + 13120 >> 2] >> ka;
                ca = ka - V | 0;
                Z = (Z | 0) > (ca | 0) ? ca : Z;
                ha = c[na + 13124 >> 2] >> ha;
                ca = ha - aa | 0;
                Y = (Y | 0) > (ca | 0) ? ca : Y;
                ca = $(W, aa) | 0;
                fa = c[na + 56 >> 2] | 0;
                ca = (V << fa) + ca | 0;
                ba = c[ba + (_ << 2) >> 2] | 0;
                X = ba + ca | 0;
                S = S + 2 << fa;
                ea = c[D >> 2] | 0;
                ga = 1 << fa;
                da = S + ga | 0;
                U = ea + da | 0;
                T = m + (n * 148 | 0) + _ + 142 | 0;
                ia = d[T >> 0] | 0;
                if ((ia | 0) == 2) {
                    ja = c[l >> 2] | 0;
                    ia = c[z >> 2] | 0;
                    la = c[x >> 2] | 0;
                    do
                        if (!(c[u >> 2] | 0)) {
                            pa = 1 - ja | 0;
                            oa = pa << fa;
                            ma = ga - oa | 0;
                            c[k >> 2] = ba + (ca - W - oa);
                            c[G >> 2] = (c[e + (_ << 2) + 172 >> 2] | 0) + (($(ka, H) | 0) + V - pa << fa);
                            do
                                if ((ja | 0) != 1) {
                                    oa = ea + ma | 0;
                                    pa = L + ($(c[na + 13128 >> 2] | 0, O) | 0) | 0;
                                    pa = c[k + (((a[(c[A >> 2] | 0) + (pa * 148 | 0) + _ + 142 >> 0] | 0) == 3 & 1) << 2) >> 2] | 0;
                                    if (!fa) {
                                        a[oa >> 0] = a[pa >> 0] | 0;
                                        na = c[o >> 2] | 0;
                                        oa = ga;
                                        break
                                    } else {
                                        b[oa >> 1] = b[pa >> 1] | 0;
                                        oa = ga;
                                        break
                                    }
                                } else oa = 0;
                            while (0);
                            pa = ($(c[na + 13128 >> 2] | 0, O) | 0) + j | 0;
                            na = Z << fa;
                            fe(ea + (oa + ma) | 0, (c[k + (((a[(c[A >> 2] | 0) + (pa * 148 | 0) + _ + 142 >> 0] | 0) == 3 & 1) << 2) >> 2] | 0) + oa | 0, na | 0) | 0;
                            if ((ia | 0) != 1) {
                                pa = oa + na | 0;
                                oa = J + ($(c[(c[o >> 2] | 0) + 13128 >> 2] | 0, O) | 0) | 0;
                                na = ea + (pa + ma) | 0;
                                ma = (c[k + (((a[(c[A >> 2] | 0) + (oa * 148 | 0) + _ + 142 >> 0] | 0) == 3 & 1) << 2) >> 2] | 0) + pa | 0;
                                if (!fa) {
                                    a[na >> 0] = a[ma >> 0] | 0;
                                    break
                                } else {
                                    b[na >> 1] = b[ma >> 1] | 0;
                                    break
                                }
                            }
                        }
                    while (0);
                    do
                        if (!la) {
                            pa = 1 - ja | 0;
                            oa = pa << fa;
                            la = ($(Y, S) | 0) + da - oa | 0;
                            c[t >> 2] = ba + (($(Y, W) | 0) + ca - oa);
                            c[Q >> 2] = (c[e + (_ << 2) + 172 >> 2] | 0) + (($(ka, P) | 0) + V - pa << fa);
                            do
                                if ((ja | 0) != 1) {
                                    ka = ea + la | 0;
                                    ma = L + ($(c[(c[o >> 2] | 0) + 13128 >> 2] | 0, M) | 0) | 0;
                                    ma = c[t + (((a[(c[A >> 2] | 0) + (ma * 148 | 0) + _ + 142 >> 0] | 0) == 3 & 1) << 2) >> 2] | 0;
                                    if (!fa) {
                                        a[ka >> 0] = a[ma >> 0] | 0;
                                        ma = ga;
                                        break
                                    } else {
                                        b[ka >> 1] = b[ma >> 1] | 0;
                                        ma = ga;
                                        break
                                    }
                                } else ma = 0;
                            while (0);
                            pa = ($(c[(c[o >> 2] | 0) + 13128 >> 2] | 0, M) | 0) + j | 0;
                            ka = Z << fa;
                            fe(ea + (ma + la) | 0, (c[t + (((a[(c[A >> 2] | 0) + (pa * 148 | 0) + _ + 142 >> 0] | 0) == 3 & 1) << 2) >> 2] | 0) + ma | 0, ka | 0) | 0;
                            if ((ia | 0) != 1) {
                                pa = ma + ka | 0;
                                oa = J + ($(c[(c[o >> 2] | 0) + 13128 >> 2] | 0, M) | 0) | 0;
                                ka = ea + (pa + la) | 0;
                                la = (c[t + (((a[(c[A >> 2] | 0) + (oa * 148 | 0) + _ + 142 >> 0] | 0) == 3 & 1) << 2) >> 2] | 0) + pa | 0;
                                if (!fa) {
                                    a[ka >> 0] = a[la >> 0] | 0;
                                    break
                                } else {
                                    b[ka >> 1] = b[la >> 1] | 0;
                                    break
                                }
                            }
                        }
                    while (0);
                    do
                        if (!ja) {
                            pa = L + ($(c[(c[o >> 2] | 0) + 13128 >> 2] | 0, y) | 0) | 0;
                            if ((a[(c[A >> 2] | 0) + (pa * 148 | 0) + _ + 142 >> 0] | 0) == 3) {
                                la = ea + S | 0;
                                ja = (c[e + (_ << 2) + 184 >> 2] | 0) + (($(ha, K) | 0) + aa << fa) | 0;
                                ka = (Y | 0) > 0;
                                if (!fa) {
                                    if (ka) ka = 0;
                                    else {
                                        ja = 0;
                                        break
                                    }
                                    while (1) {
                                        a[la >> 0] = a[ja >> 0] | 0;
                                        ka = ka + 1 | 0;
                                        if ((ka | 0) == (Y | 0)) {
                                            ja = 0;
                                            break
                                        } else {
                                            la = la + S | 0;
                                            ja = ja + ga | 0
                                        }
                                    }
                                } else {
                                    if (ka) ka = 0;
                                    else {
                                        ja = 0;
                                        break
                                    }
                                    while (1) {
                                        b[la >> 1] = b[ja >> 1] | 0;
                                        ka = ka + 1 | 0;
                                        if ((ka | 0) == (Y | 0)) {
                                            ja = 0;
                                            break
                                        } else {
                                            la = la + S | 0;
                                            ja = ja + ga | 0
                                        }
                                    }
                                }
                            } else ja = 1
                        } else ja = 0;
                    while (0);
                    do
                        if (!ia) {
                            pa = J + ($(c[(c[o >> 2] | 0) + 13128 >> 2] | 0, y) | 0) | 0;
                            if ((a[(c[A >> 2] | 0) + (pa * 148 | 0) + _ + 142 >> 0] | 0) == 3) {
                                ia = ea + ((Z << fa) + da) | 0;
                                ha = (c[e + (_ << 2) + 184 >> 2] | 0) + (($(ha, I) | 0) + aa << fa) | 0;
                                ka = (Y | 0) > 0;
                                if (!fa) {
                                    if (ka) B = 0;
                                    else break;
                                    while (1) {
                                        a[ia >> 0] = a[ha >> 0] | 0;
                                        B = B + 1 | 0;
                                        if ((B | 0) == (Y | 0)) {
                                            C = 0;
                                            B = 96;
                                            break
                                        } else {
                                            ia = ia + S | 0;
                                            ha = ha + ga | 0
                                        }
                                    }
                                } else {
                                    if (ka) B = 0;
                                    else break;
                                    while (1) {
                                        b[ia >> 1] = b[ha >> 1] | 0;
                                        B = B + 1 | 0;
                                        if ((B | 0) == (Y | 0)) {
                                            C = 0;
                                            B = 96;
                                            break
                                        } else {
                                            ia = ia + S | 0;
                                            ha = ha + ga | 0
                                        }
                                    }
                                }
                            } else {
                                C = 1;
                                B = 96
                            }
                        } else {
                            C = 0;
                            B = 96
                        }
                    while (0);
                    if ((B | 0) == 96 ? (B = 0, v = ja << fa, w = ja + Z + C << fa, (Y | 0) > 0) : 0) {
                        da = ea + (da - v) | 0;
                        ea = 0;
                        ba = ba + (ca - v) | 0;
                        while (1) {
                            fe(da | 0, ba | 0, w | 0) | 0;
                            ea = ea + 1 | 0;
                            if ((ea | 0) == (Y | 0)) break;
                            else {
                                da = da + S | 0;
                                ba = ba + W | 0
                            }
                        }
                    }
                    Eb(e, X, W, V, aa, Z, Y, _, j, y);
                    Aa[c[R >> 2] & 3](X, U, W, S, q, l, Z, Y, _, r, s, p, c[(c[o >> 2] | 0) + 52 >> 2] | 0);
                    Fb(e, X, U, W, S, f, g, Z, Y, _);
                    a[T >> 0] = 3
                } else if ((ia | 0) == 1) {
                    ca = Z << fa;
                    if ((Y | 0) > 0) {
                        ba = U;
                        da = 0;
                        ea = X;
                        while (1) {
                            fe(ba | 0, ea | 0, ca | 0) | 0;
                            da = da + 1 | 0;
                            if ((da | 0) == (Y | 0)) break;
                            else {
                                ba = ba + S | 0;
                                ea = ea + W | 0
                            }
                        }
                    }
                    Eb(e, X, W, V, aa, Z, Y, _, j, y);
                    ya[c[F >> 2] & 1](X, U, W, S, q, l, Z, Y, _, c[(c[o >> 2] | 0) + 52 >> 2] | 0);
                    Fb(e, X, U, W, S, f, g, Z, Y, _);
                    a[T >> 0] = 3
                }
                _ = _ + 1 | 0;
                if ((_ | 0) >= (N | 0)) break;
                na = c[o >> 2] | 0
            }
            i = h;
            return
        }

        function Db(a, b, d, e) {
            a = a | 0;
            b = b | 0;
            d = d | 0;
            e = e | 0;
            var f = 0,
                g = 0,
                h = 0,
                j = 0,
                k = 0;
            f = i;
            h = c[a + 200 >> 2] | 0;
            k = ((c[h + 13120 >> 2] | 0) - e | 0) > (b | 0);
            h = ((c[h + 13124 >> 2] | 0) - e | 0) > (d | 0);
            j = (d | 0) == 0;
            g = (b | 0) == 0;
            if (!(j | g)) Bb(a, b - e | 0, d - e | 0, e);
            if (!(j | k)) Bb(a, b, d - e | 0, e);
            if (g | h) {
                i = f;
                return
            }
            Bb(a, b - e | 0, d, e);
            i = f;
            return
        }

        function Eb(d, e, f, g, h, j, k, l, m, n) {
            d = d | 0;
            e = e | 0;
            f = f | 0;
            g = g | 0;
            h = h | 0;
            j = j | 0;
            k = k | 0;
            l = l | 0;
            m = m | 0;
            n = n | 0;
            var o = 0,
                p = 0,
                q = 0,
                r = 0,
                s = 0,
                t = 0,
                u = 0;
            o = i;
            q = c[d + 200 >> 2] | 0;
            p = c[q + 56 >> 2] | 0;
            s = c[q + 13120 >> 2] >> c[q + (l << 2) + 13168 >> 2];
            q = c[q + 13124 >> 2] >> c[q + (l << 2) + 13180 >> 2];
            u = d + (l << 2) + 172 | 0;
            t = n << 1;
            r = j << p;
            fe((c[u >> 2] | 0) + (($(s, t) | 0) + g << p) | 0, e | 0, r | 0) | 0;
            fe((c[u >> 2] | 0) + (($(s, t | 1) | 0) + g << p) | 0, e + ($(k + -1 | 0, f) | 0) | 0, r | 0) | 0;
            d = d + (l << 2) + 184 | 0;
            r = c[d >> 2] | 0;
            l = m << 1;
            t = r + (($(q, l) | 0) + h << p) | 0;
            m = 1 << p;
            n = (p | 0) == 0;
            g = (k | 0) > 0;
            if (n) {
                if (g) {
                    r = t;
                    t = 0;
                    s = e;
                    while (1) {
                        a[r >> 0] = a[s >> 0] | 0;
                        t = t + 1 | 0;
                        if ((t | 0) == (k | 0)) break;
                        else {
                            r = r + m | 0;
                            s = s + f | 0
                        }
                    }
                    r = c[d >> 2] | 0
                }
            } else if (g) {
                d = 0;
                s = e;
                while (1) {
                    b[t >> 1] = b[s >> 1] | 0;
                    d = d + 1 | 0;
                    if ((d | 0) == (k | 0)) break;
                    else {
                        t = t + m | 0;
                        s = s + f | 0
                    }
                }
            }
            h = r + (($(q, l | 1) | 0) + h << p) | 0;
            j = e + (j + -1 << p) | 0;
            if (n) {
                if (g) p = 0;
                else {
                    i = o;
                    return
                }
                while (1) {
                    a[h >> 0] = a[j >> 0] | 0;
                    p = p + 1 | 0;
                    if ((p | 0) == (k | 0)) break;
                    else {
                        h = h + m | 0;
                        j = j + f | 0
                    }
                }
                i = o;
                return
            } else {
                if (g) p = 0;
                else {
                    i = o;
                    return
                }
                while (1) {
                    b[h >> 1] = b[j >> 1] | 0;
                    p = p + 1 | 0;
                    if ((p | 0) == (k | 0)) break;
                    else {
                        h = h + m | 0;
                        j = j + f | 0
                    }
                }
                i = o;
                return
            }
        }

        function Fb(b, d, e, f, g, h, j, k, l, m) {
            b = b | 0;
            d = d | 0;
            e = e | 0;
            f = f | 0;
            g = g | 0;
            h = h | 0;
            j = j | 0;
            k = k | 0;
            l = l | 0;
            m = m | 0;
            var n = 0,
                o = 0,
                p = 0,
                q = 0,
                r = 0,
                s = 0,
                t = 0,
                u = 0,
                v = 0,
                w = 0,
                x = 0,
                y = 0,
                z = 0,
                A = 0,
                B = 0,
                C = 0;
            n = i;
            t = c[b + 200 >> 2] | 0;
            if (!(a[(c[b + 204 >> 2] | 0) + 40 >> 0] | 0)) {
                if (!(a[t + 13056 >> 0] | 0)) {
                    i = n;
                    return
                }
                if (!(c[t + 68 >> 2] | 0)) {
                    i = n;
                    return
                }
            }
            p = b + 200 | 0;
            C = c[t + 13084 >> 2] | 0;
            v = 1 << C;
            o = c[t + (m << 2) + 13168 >> 2] | 0;
            s = c[t + (m << 2) + 13180 >> 2] | 0;
            m = h >> C;
            z = j >> C;
            k = k + h >> C;
            l = l + j >> C;
            t = v >> o << c[t + 56 >> 2];
            if ((z | 0) >= (l | 0)) {
                i = n;
                return
            }
            u = (m | 0) < (k | 0);
            b = b + 4348 | 0;
            v = v >> s;
            w = (v | 0) > 0;
            do {
                if (u) {
                    x = z - j | 0;
                    y = m;
                    do {
                        A = c[p >> 2] | 0;
                        C = ($(c[A + 13156 >> 2] | 0, z) | 0) + y | 0;
                        if ((a[(c[b >> 2] | 0) + C >> 0] | 0) != 0 ? (r = c[A + 13084 >> 2] | 0, q = x << r >> s, r = y - h << r >> o << c[A + 56 >> 2], w) : 0) {
                            C = e + (($(q, g) | 0) + r) | 0;
                            A = 0;
                            B = d + (($(q, f) | 0) + r) | 0;
                            while (1) {
                                fe(B | 0, C | 0, t | 0) | 0;
                                A = A + 1 | 0;
                                if ((A | 0) == (v | 0)) break;
                                else {
                                    C = C + g | 0;
                                    B = B + f | 0
                                }
                            }
                        }
                        y = y + 1 | 0
                    } while ((y | 0) != (k | 0))
                }
                z = z + 1 | 0
            } while ((z | 0) != (l | 0));
            i = n;
            return
        }

        function Gb(a, b, e) {
            a = a | 0;
            b = b | 0;
            e = e | 0;
            var f = 0,
                g = 0,
                h = 0;
            f = i;
            g = c[a + 200 >> 2] | 0;
            h = c[g + 13084 >> 2] | 0;
            if ((e | b | 0) < 0) {
                e = 2;
                i = f;
                return e | 0
            }
            b = b >> h;
            e = e >> h;
            h = c[g + 13156 >> 2] | 0;
            if ((b | 0) >= (h | 0)) {
                e = 2;
                i = f;
                return e | 0
            }
            if ((e | 0) >= (c[g + 13160 >> 2] | 0)) {
                e = 2;
                i = f;
                return e | 0
            }
            e = ($(h, e) | 0) + b | 0;
            e = d[(c[a + 4348 >> 2] | 0) + e >> 0] | 0;
            i = f;
            return e | 0
        }

        function Hb(b, e, f, g) {
            b = b | 0;
            e = e | 0;
            f = f | 0;
            g = g | 0;
            var h = 0,
                j = 0;
            h = i;
            j = c[b + 204 >> 2] | 0;
            e = (c[((f | 0) == 1 ? j + 28 | 0 : j + 32 | 0) >> 2] | 0) + e | 0;
            if ((e | 0) < 0) e = 0;
            else e = (e | 0) > 57 ? 57 : e;
            do
                if ((c[(c[b + 200 >> 2] | 0) + 4 >> 2] | 0) == 1) {
                    if ((e | 0) >= 30)
                        if ((e | 0) > 43) {
                            e = e + -6 | 0;
                            break
                        } else {
                            e = d[1392 + (e + -30) >> 0] | 0;
                            break
                        }
                } else if ((e | 0) < 0) e = 0;
            else e = (e | 0) > 51 ? 51 : e;
            while (0);
            g = g + 2 + e | 0;
            if ((g | 0) < 0) {
                j = 0;
                j = 1336 + j | 0;
                j = a[j >> 0] | 0;
                j = j & 255;
                i = h;
                return j | 0
            }
            j = (g | 0) > 53 ? 53 : g;
            j = 1336 + j | 0;
            j = a[j >> 0] | 0;
            j = j & 255;
            i = h;
            return j | 0
        }

        function Ib(b, d, e, f) {
            b = b | 0;
            d = d | 0;
            e = e | 0;
            f = f | 0;
            var g = 0,
                h = 0,
                j = 0,
                k = 0,
                l = 0,
                m = 0,
                n = 0,
                o = 0,
                p = 0,
                q = 0;
            g = i;
            k = b + 4376 | 0;
            c[k >> 2] = 0;
            a: do
                if ((e | 0) > 1) {
                    m = 0;
                    while (1) {
                        if (!(a[d + m >> 0] | 0)) {
                            if ((m | 0) > 0) {
                                l = m + -1 | 0;
                                l = (a[d + l >> 0] | 0) == 0 ? l : m
                            } else l = m;
                            m = l + 2 | 0;
                            if (((m | 0) < (e | 0) ? (a[d + (l + 1) >> 0] | 0) == 0 : 0) ? (j = a[d + m >> 0] | 0, (j & 255) < 4) : 0) break
                        } else l = m;
                        m = l + 2 | 0;
                        if ((l + 3 | 0) >= (e | 0)) break a
                    }
                    m = l;
                    e = j << 24 >> 24 == 3 ? e : l
                } else m = 0;
            while (0);
            if ((m | 0) >= (e + -1 | 0)) {
                c[f + 12 >> 2] = d;
                c[f + 8 >> 2] = e;
                q = e;
                i = g;
                return q | 0
            }
            nd(f, f + 4 | 0, e + 32 | 0);
            j = c[f >> 2] | 0;
            if (!j) {
                q = -12;
                i = g;
                return q | 0
            }
            fe(j | 0, d | 0, m | 0) | 0;
            o = m + 2 | 0;
            b: do
                if ((o | 0) < (e | 0)) {
                    l = b + 4384 | 0;
                    b = b + 4380 | 0;
                    n = m;
                    c: while (1) {
                        p = d + o | 0;
                        q = a[p >> 0] | 0;
                        do
                            if ((q & 255) <= 3) {
                                p = a[d + m >> 0] | 0;
                                if (!(p << 24 >> 24))
                                    if (!(a[d + (m + 1) >> 0] | 0)) {
                                        if (q << 24 >> 24 != 3) {
                                            e = m;
                                            break b
                                        }
                                        o = n + 1 | 0;
                                        a[j + n >> 0] = 0;
                                        n = n + 2 | 0;
                                        a[j + o >> 0] = 0;
                                        m = m + 3 | 0;
                                        q = (c[k >> 2] | 0) + 1 | 0;
                                        c[k >> 2] = q;
                                        p = c[l >> 2] | 0;
                                        if ((p | 0) < (q | 0)) {
                                            p = p << 1;
                                            c[l >> 2] = p;
                                            ld(b, p, 4) | 0;
                                            p = c[b >> 2] | 0;
                                            if (!p) {
                                                f = -12;
                                                break c
                                            }
                                        } else {
                                            p = c[b >> 2] | 0;
                                            if (!p) break
                                        }
                                        c[p + ((c[k >> 2] | 0) + -1 << 2) >> 2] = o
                                    } else {
                                        p = 0;
                                        h = 26
                                    } else h = 26
                            } else {
                                a[j + n >> 0] = a[d + m >> 0] | 0;
                                a[j + (n + 1) >> 0] = a[d + (m + 1) >> 0] | 0;
                                p = a[p >> 0] | 0;
                                n = n + 2 | 0;
                                m = o;
                                h = 26
                            }
                        while (0);
                        if ((h | 0) == 26) {
                            h = 0;
                            a[j + n >> 0] = p;
                            n = n + 1 | 0;
                            m = m + 1 | 0
                        }
                        o = m + 2 | 0;
                        if ((o | 0) >= (e | 0)) {
                            h = 15;
                            break b
                        }
                    }
                    i = g;
                    return f | 0
                } else {
                    n = m;
                    h = 15
                }
            while (0);
            if ((h | 0) == 15)
                if ((m | 0) < (e | 0)) {
                    h = e + n | 0;
                    k = m;
                    while (1) {
                        a[j + n >> 0] = a[d + k >> 0] | 0;
                        k = k + 1 | 0;
                        if ((k | 0) == (e | 0)) break;
                        else n = n + 1 | 0
                    }
                    n = h - m | 0
                } else e = m;
            h = j + n + 0 | 0;
            d = h + 32 | 0;
            do {
                a[h >> 0] = 0;
                h = h + 1 | 0
            } while ((h | 0) < (d | 0));
            c[f + 12 >> 2] = j;
            c[f + 8 >> 2] = n;
            q = e;
            i = g;
            return q | 0
        }

        function Jb(b) {
            b = b | 0;
            var d = 0,
                e = 0,
                f = 0,
                g = 0,
                h = 0;
            e = i;
            f = b + 60 | 0;
            d = c[f >> 2] | 0;
            Zc();
            ac();
            f = c[f >> 2] | 0;
            c[f + 4 >> 2] = b;
            g = md(31328) | 0;
            c[f + 136 >> 2] = g;
            if ((((g | 0) != 0 ? (c[f + 72 >> 2] = g, c[f + 8 >> 2] = f, g = fd(199) | 0, c[f + 152 >> 2] = g, (g | 0) != 0) : 0) ? (g = wd() | 0, c[f + 164 >> 2] = g, (g | 0) != 0) : 0) ? (h = wd() | 0, c[f + 2524 >> 2] = h, (h | 0) != 0) : 0) {
                c[f + 2528 >> 2] = h;
                c[f + 2592 >> 2] = 2147483647;
                a[f + 4469 >> 0] = 1;
                c[f + 2584 >> 2] = 0;
                c[d + 4368 >> 2] = 0;
                c[d + 4520 >> 2] = 0;
                f = b + 808 | 0;
                if (!(c[f >> 2] & 2)) a[d + 141 >> 0] = 1;
                else a[d + 141 >> 0] = c[b + 800 >> 2];
                if ((c[f >> 2] & 1 | 0) != 0 ? (c[b + 800 >> 2] | 0) > 1 : 0) {
                    a[d + 140 >> 0] = 1;
                    h = 0;
                    i = e;
                    return h | 0
                }
                a[d + 140 >> 0] = 2;
                h = 0;
                i = e;
                return h | 0
            }
            Lb(b) | 0;
            h = -12;
            i = e;
            return h | 0
        }

        function Kb(f, g, h, j) {
            f = f | 0;
            g = g | 0;
            h = h | 0;
            j = j | 0;
            var k = 0,
                l = 0,
                m = 0,
                n = 0,
                o = 0,
                p = 0,
                q = 0,
                r = 0,
                s = 0,
                t = 0,
                u = 0,
                v = 0,
                w = 0,
                x = 0,
                y = 0,
                z = 0,
                A = 0,
                B = 0,
                C = 0,
                E = 0,
                F = 0,
                G = 0,
                H = 0,
                I = 0,
                J = 0,
                K = 0,
                L = 0,
                M = 0,
                N = 0,
                O = 0,
                P = 0,
                Q = 0,
                R = 0,
                S = 0,
                T = 0,
                U = 0,
                V = 0,
                W = 0,
                X = 0,
                Y = 0,
                Z = 0,
                _ = 0,
                aa = 0,
                ba = 0,
                ca = 0,
                da = 0,
                ea = 0,
                fa = 0,
                ga = 0,
                ha = 0,
                ia = 0,
                ja = 0,
                ka = 0,
                la = 0,
                ma = 0,
                na = 0,
                oa = 0,
                pa = 0,
                qa = 0,
                ra = 0,
                sa = 0,
                ua = 0,
                va = 0,
                wa = 0,
                xa = 0,
                ya = 0,
                za = 0,
                Aa = 0,
                Ba = 0,
                Ca = 0,
                Ea = 0,
                Fa = 0,
                Ga = 0,
                Ha = 0,
                Ia = 0,
                Ja = 0,
                Ka = 0,
                La = 0,
                Ma = 0,
                Na = 0,
                Oa = 0,
                Pa = 0,
                Qa = 0,
                Ra = 0,
                Sa = 0,
                Ta = 0,
                Ua = 0,
                Va = 0,
                Wa = 0,
                Xa = 0,
                Ya = 0,
                Za = 0,
                _a = 0,
                $a = 0,
                ab = 0;
            k = i;
            i = i + 16 | 0;
            q = k + 8 | 0;
            n = k;
            m = c[f + 60 >> 2] | 0;
            l = j + 28 | 0;
            K = c[l >> 2] | 0;
            if (!K) {
                g = $b(m, g, 1) | 0;
                if ((g | 0) < 0) {
                    _a = g;
                    i = k;
                    return _a | 0
                }
                c[h >> 2] = g;
                _a = 0;
                i = k;
                return _a | 0
            }
            r = m + 2520 | 0;
            c[r >> 2] = 0;
            f = m + 4524 | 0;
            b[f >> 1] = 1;
            J = c[j + 24 >> 2] | 0;
            c[r >> 2] = 0;
            G = m + 2584 | 0;
            A = m + 2588 | 0;
            c[A >> 2] = c[G >> 2];
            c[G >> 2] = 0;
            w = m + 4408 | 0;
            c[w >> 2] = 0;
            a: do
                if ((K | 0) > 3) {
                    H = m + 4470 | 0;
                    F = m + 4412 | 0;
                    z = m + 4404 | 0;
                    v = m + 4388 | 0;
                    C = m + 4396 | 0;
                    x = m + 4392 | 0;
                    E = m + 4384 | 0;
                    y = m + 4380 | 0;
                    j = m + 4376 | 0;
                    u = m + 136 | 0;
                    t = m + 2512 | 0;
                    I = m + 4480 | 0;
                    while (1) {
                        B = (a[H >> 0] | 0) == 0;
                        if (B) {
                            while (1) {
                                L = J + 1 | 0;
                                if (((a[J >> 0] | 0) == 0 ? (a[L >> 0] | 0) == 0 : 0) ? (a[J + 2 >> 0] | 0) == 1 : 0) break;
                                if ((K | 0) < 5) {
                                    p = -1094995529;
                                    o = 180;
                                    break a
                                }
                                J = L;
                                K = K + -1 | 0
                            }
                            J = J + 3 | 0;
                            M = 0;
                            K = K + -3 | 0
                        } else {
                            L = c[I >> 2] | 0;
                            if ((L | 0) > 0) {
                                N = 0;
                                M = 0;
                                do {
                                    N = d[J + M >> 0] | N << 8;
                                    M = M + 1 | 0
                                } while ((M | 0) != (L | 0));
                                M = N
                            } else M = 0;
                            K = K - L | 0;
                            if ((M | 0) > (K | 0)) {
                                p = -1094995529;
                                o = 180;
                                break a
                            }
                            J = J + L | 0
                        }
                        B = B ? K : M;
                        L = c[F >> 2] | 0;
                        N = c[w >> 2] | 0;
                        if ((L | 0) < (N + 1 | 0)) {
                            L = L + 1 | 0;
                            M = kd(c[z >> 2] | 0, L, 16) | 0;
                            if (!M) {
                                p = -12;
                                o = 180;
                                break a
                            }
                            c[z >> 2] = M;
                            N = c[F >> 2] | 0;
                            ce(M + (N << 4) | 0, 0, L - N << 4 | 0) | 0;
                            ld(v, L, 4) | 0;
                            ld(C, L, 4) | 0;
                            ld(x, L, 4) | 0;
                            N = c[C >> 2] | 0;
                            c[N + (c[F >> 2] << 2) >> 2] = 1024;
                            N = od(c[N + (c[F >> 2] << 2) >> 2] | 0, 4) | 0;
                            c[(c[x >> 2] | 0) + (c[F >> 2] << 2) >> 2] = N;
                            c[F >> 2] = L;
                            N = c[w >> 2] | 0
                        }
                        c[E >> 2] = c[(c[C >> 2] | 0) + (N << 2) >> 2];
                        c[y >> 2] = c[(c[x >> 2] | 0) + (N << 2) >> 2];
                        M = c[z >> 2] | 0;
                        L = Ib(m, J, B, M + (N << 4) | 0) | 0;
                        c[(c[v >> 2] | 0) + (c[w >> 2] << 2) >> 2] = c[j >> 2];
                        c[(c[C >> 2] | 0) + (c[w >> 2] << 2) >> 2] = c[E >> 2];
                        Za = c[y >> 2] | 0;
                        _a = c[w >> 2] | 0;
                        c[w >> 2] = _a + 1;
                        c[(c[x >> 2] | 0) + (_a << 2) >> 2] = Za;
                        if ((L | 0) < 0) {
                            p = L;
                            o = 180;
                            break a
                        }
                        Za = c[u >> 2] | 0;
                        Xa = c[M + (N << 4) + 12 >> 2] | 0;
                        Ya = c[M + (N << 4) + 8 >> 2] | 0;
                        Ya = Ya >>> 0 > 268435455 ? -8 : Ya << 3;
                        _a = Ya >>> 0 > 2147483639 | (Xa | 0) == 0;
                        Ya = _a ? 0 : Ya;
                        Xa = _a ? 0 : Xa;
                        B = _a ? -1094995529 : 0;
                        c[Za + 204 >> 2] = Xa;
                        c[Za + 216 >> 2] = Ya;
                        c[Za + 220 >> 2] = Ya + 8;
                        c[Za + 208 >> 2] = Xa + (Ya >> 3);
                        c[Za + 212 >> 2] = 0;
                        if (_a) {
                            p = B;
                            o = 180;
                            break a
                        }
                        Ob(m) | 0;
                        if (((c[t >> 2] | 0) + -36 | 0) >>> 0 < 2) c[G >> 2] = 1;
                        K = K - L | 0;
                        if ((K | 0) <= 3) break;
                        else J = J + L | 0
                    }
                    if ((c[w >> 2] | 0) > 0) {
                        la = m + 4 | 0;
                        Ga = m + 1448 | 0;
                        aa = m + 2046 | 0;
                        _ = m + 1428 | 0;
                        Fa = m + 204 | 0;
                        wa = m + 200 | 0;
                        Ka = m + 1449 | 0;
                        La = m + 1432 | 0;
                        Pa = m + 1436 | 0;
                        Qa = m + 2580 | 0;
                        Ia = m + 156 | 0;
                        ra = m + 1440 | 0;
                        I = m + 1450 | 0;
                        L = m + 1620 | 0;
                        va = m + 2572 | 0;
                        K = m + 2516 | 0;
                        M = m + 2576 | 0;
                        W = m + 2056 | 0;
                        X = m + 2057 | 0;
                        N = m + 2058 | 0;
                        P = m + 2052 | 0;
                        O = m + 2048 | 0;
                        Na = m + 2068 | 0;
                        S = m + 2072 | 0;
                        Q = m + 2076 | 0;
                        T = m + 2080 | 0;
                        Y = m + 2061 | 0;
                        V = m + 2084 | 0;
                        U = m + 2088 | 0;
                        Z = m + 2062 | 0;
                        J = m + 1451 | 0;
                        Oa = m + 2108 | 0;
                        Ja = m + 2112 | 0;
                        Ma = m + 2500 | 0;
                        na = m + 2592 | 0;
                        oa = m + 2604 | 0;
                        pa = m + 4416 | 0;
                        Ha = q + 4 | 0;
                        xa = m + 4320 | 0;
                        za = m + 2596 | 0;
                        ya = m + 2600 | 0;
                        Aa = m + 4324 | 0;
                        Ba = m + 4344 | 0;
                        Ca = m + 4348 | 0;
                        Ea = m + 4328 | 0;
                        sa = m + 160 | 0;
                        qa = m + 140 | 0;
                        ua = m + 164 | 0;
                        R = m + 2096 | 0;
                        F = m + 2100 | 0;
                        E = m + 2104 | 0;
                        G = m + 141 | 0;
                        H = m + 4368 | 0;
                        ca = m + 2504 | 0;
                        ba = m + 2508 | 0;
                        ea = m + 4332 | 0;
                        da = m + 4336 | 0;
                        fa = m + 4340 | 0;
                        ha = m + 4352 | 0;
                        ga = m + 4316 | 0;
                        ia = m + 2608 | 0;
                        ka = m + 196 | 0;
                        ma = m + 4364 | 0;
                        ja = m + 168 | 0;
                        C = 0;
                        b: while (1) {
                            c[j >> 2] = c[(c[v >> 2] | 0) + (C << 2) >> 2];
                            c[y >> 2] = c[(c[x >> 2] | 0) + (C << 2) >> 2];
                            Za = c[z >> 2] | 0;
                            Ya = c[Za + (C << 4) + 12 >> 2] | 0;
                            Za = c[Za + (C << 4) + 8 >> 2] | 0;
                            _a = c[u >> 2] | 0;
                            Za = Za >>> 0 > 268435455 ? -8 : Za << 3;
                            Ra = Za >>> 0 > 2147483639 | (Ya | 0) == 0;
                            Za = Ra ? 0 : Za;
                            Ya = Ra ? 0 : Ya;
                            c[_a + 204 >> 2] = Ya;
                            c[_a + 216 >> 2] = Za;
                            c[_a + 220 >> 2] = Za + 8;
                            c[_a + 208 >> 2] = Ya + (Za >> 3);
                            c[_a + 212 >> 2] = 0;
                            c: do
                                if (Ra) {
                                    s = Ra ? -1094995529 : 0;
                                    o = 178
                                } else {
                                    Ra = Ob(m) | 0;
                                    d: do
                                        if ((Ra | 0) >= 0) {
                                            if (!Ra) break c;
                                            switch (c[t >> 2] | 0) {
                                                case 37:
                                                case 36:
                                                    {
                                                        b[ma >> 1] = (e[ma >> 1] | 0) + 1 & 255;
                                                        c[na >> 2] = 2147483647;
                                                        break c
                                                    };
                                                case 48:
                                                    {
                                                        Ra = Dc(m) | 0;
                                                        if ((Ra | 0) < 0) break d;
                                                        else break c
                                                    };
                                                case 34:
                                                    {
                                                        Ra = Ec(m) | 0;
                                                        if ((Ra | 0) < 0) break d;
                                                        else break c
                                                    };
                                                case 40:
                                                case 39:
                                                    {
                                                        Ra = Gc(m) | 0;
                                                        if ((Ra | 0) < 0) break d;
                                                        else break c
                                                    };
                                                case 9:
                                                case 8:
                                                case 7:
                                                case 6:
                                                case 21:
                                                case 20:
                                                case 19:
                                                case 18:
                                                case 17:
                                                case 16:
                                                case 5:
                                                case 4:
                                                case 3:
                                                case 2:
                                                case 0:
                                                case 1:
                                                    {
                                                        Ra = c[u >> 2] | 0;
                                                        Sa = Ra + 204 | 0;
                                                        _a = (bd(Sa) | 0) & 255;
                                                        a[Ga >> 0] = _a;
                                                        Ta = c[t >> 2] | 0;
                                                        if (!((Ta + -16 | 0) >>> 0 > 4 | _a << 24 >> 24 == 0) ? (b[ma >> 1] = (e[ma >> 1] | 0) + 1 & 255, c[na >> 2] = 2147483647, (Ta + -19 | 0) >>> 0 < 2) : 0) {
                                                            Yb(m);
                                                            Ta = c[t >> 2] | 0
                                                        }
                                                        a[aa >> 0] = 0;
                                                        if ((Ta + -16 | 0) >>> 0 < 8) a[aa >> 0] = bd(Sa) | 0;
                                                        Ta = dd(Sa) | 0;
                                                        c[_ >> 2] = Ta;
                                                        if (Ta >>> 0 > 255) {
                                                            p = B;
                                                            o = 180;
                                                            break a
                                                        }
                                                        Ta = c[m + (Ta << 2) + 400 >> 2] | 0;
                                                        if (!Ta) {
                                                            p = B;
                                                            o = 180;
                                                            break a
                                                        }
                                                        if (!(a[Ga >> 0] | 0)) {
                                                            Wa = c[Ta + 4 >> 2] | 0;
                                                            if ((c[Fa >> 2] | 0) != (Wa | 0)) {
                                                                p = B;
                                                                o = 180;
                                                                break a
                                                            }
                                                        } else Wa = c[Ta + 4 >> 2] | 0;
                                                        c[Fa >> 2] = Wa;
                                                        Ua = c[t >> 2] | 0;
                                                        Va = (Ua | 0) == 21;
                                                        if (Va ? (c[A >> 2] | 0) == 1 : 0) a[aa >> 0] = 1;
                                                        Ta = c[wa >> 2] | 0;
                                                        Wa = c[(c[m + (c[Wa >> 2] << 2) + 272 >> 2] | 0) + 4 >> 2] | 0;
                                                        if ((Ta | 0) != (Wa | 0)) {
                                                            c[wa >> 2] = Wa;
                                                            e: do
                                                                if (Ta) {
                                                                    if ((Ua + -16 | 0) >>> 0 > 7 | Va) break;
                                                                    do
                                                                        if ((c[Wa + 13120 >> 2] | 0) == (c[Ta + 13120 >> 2] | 0)) {
                                                                            if ((c[Wa + 13124 >> 2] | 0) != (c[Ta + 13124 >> 2] | 0)) break;
                                                                            if ((c[Wa + 76 + (((c[Wa + 72 >> 2] | 0) + -1 | 0) * 12 | 0) >> 2] | 0) == (c[Ta + (((c[Ta + 72 >> 2] | 0) + -1 | 0) * 12 | 0) + 76 >> 2] | 0)) break e
                                                                        }
                                                                    while (0);
                                                                    a[aa >> 0] = 0
                                                                }
                                                            while (0);
                                                            Yb(m);
                                                            Ta = c[wa >> 2] | 0;
                                                            Nb(m);
                                                            Va = c[Ta + 13064 >> 2] | 0;
                                                            Wa = Ta + 13120 | 0;
                                                            ab = c[Wa >> 2] | 0;
                                                            Xa = Ta + 13124 | 0;
                                                            $a = c[Xa >> 2] | 0;
                                                            Va = $(($a >> Va) + 1 | 0, (ab >> Va) + 1 | 0) | 0;
                                                            Ua = $(c[Ta + 13132 >> 2] | 0, c[Ta + 13128 >> 2] | 0) | 0;
                                                            _a = Ta + 13156 | 0;
                                                            Za = Ta + 13160 | 0;
                                                            Ya = $(c[Za >> 2] | 0, c[_a >> 2] | 0) | 0;
                                                            c[za >> 2] = (ab >> 2) + 1;
                                                            c[ya >> 2] = ($a >> 2) + 1;
                                                            c[ca >> 2] = pd(Ua, 148) | 0;
                                                            $a = pd(Ua, 8) | 0;
                                                            c[ba >> 2] = $a;
                                                            if ((c[ca >> 2] | 0) == 0 | ($a | 0) == 0) {
                                                                o = 71;
                                                                break b
                                                            }
                                                            $a = Ta + 13144 | 0;
                                                            ab = Ta + 13140 | 0;
                                                            c[ea >> 2] = fd($(c[ab >> 2] | 0, c[$a >> 2] | 0) | 0) | 0;
                                                            ab = od(c[$a >> 2] | 0, c[ab >> 2] | 0) | 0;
                                                            c[da >> 2] = ab;
                                                            if ((c[ea >> 2] | 0) == 0 | (ab | 0) == 0) {
                                                                o = 71;
                                                                break b
                                                            }
                                                            c[Ba >> 2] = od(c[Ta + 13148 >> 2] | 0, c[Ta + 13152 >> 2] | 0) | 0;
                                                            c[fa >> 2] = md(Ya) | 0;
                                                            Ya = fd($((c[Za >> 2] | 0) + 1 | 0, (c[_a >> 2] | 0) + 1 | 0) | 0) | 0;
                                                            c[Ca >> 2] = Ya;
                                                            if (!(c[fa >> 2] | 0)) {
                                                                o = 71;
                                                                break b
                                                            }
                                                            if ((c[Ba >> 2] | 0) == 0 | (Ya | 0) == 0) {
                                                                o = 71;
                                                                break b
                                                            }
                                                            c[ha >> 2] = fd(Ua) | 0;
                                                            c[Ea >> 2] = od(Va, 4) | 0;
                                                            ab = od(Va, 1) | 0;
                                                            c[ga >> 2] = ab;
                                                            if (!ab) {
                                                                o = 71;
                                                                break b
                                                            }
                                                            if (!(c[ha >> 2] | 0)) {
                                                                o = 71;
                                                                break b
                                                            }
                                                            if (!(c[Ea >> 2] | 0)) {
                                                                o = 71;
                                                                break b
                                                            }
                                                            c[xa >> 2] = pd(c[za >> 2] | 0, c[ya >> 2] | 0) | 0;
                                                            ab = pd(c[za >> 2] | 0, c[ya >> 2] | 0) | 0;
                                                            c[Aa >> 2] = ab;
                                                            if ((c[xa >> 2] | 0) == 0 | (ab | 0) == 0) {
                                                                o = 71;
                                                                break b
                                                            }
                                                            ab = c[la >> 2] | 0;
                                                            c[ab + 124 >> 2] = c[Wa >> 2];
                                                            c[ab + 128 >> 2] = c[Xa >> 2];
                                                            c[ab + 116 >> 2] = c[Ta + 12 >> 2];
                                                            c[ab + 120 >> 2] = c[Ta + 16 >> 2];
                                                            c[ab + 136 >> 2] = c[Ta + 60 >> 2];
                                                            c[ab + 172 >> 2] = c[Ta + (((c[Ta + 72 >> 2] | 0) + -1 | 0) * 12 | 0) + 80 >> 2];
                                                            ab = Ta + 160 | 0;
                                                            c[q + 0 >> 2] = c[ab + 0 >> 2];
                                                            c[q + 4 >> 2] = c[ab + 4 >> 2];
                                                            if (!(c[Ta + 176 >> 2] | 0)) {
                                                                Ua = c[la >> 2] | 0;
                                                                c[Ua + 392 >> 2] = 1
                                                            } else {
                                                                Ua = c[la >> 2] | 0;
                                                                c[Ua + 392 >> 2] = (c[Ta + 184 >> 2] | 0) != 0 ? 2 : 1
                                                            }
                                                            if (!(c[Ta + 188 >> 2] | 0)) {
                                                                c[Ua + 380 >> 2] = 2;
                                                                c[Ua + 384 >> 2] = 2;
                                                                c[Ua + 388 >> 2] = 2
                                                            } else {
                                                                c[Ua + 380 >> 2] = d[Ta + 192 >> 0];
                                                                c[Ua + 384 >> 2] = d[Ta + 193 >> 0];
                                                                c[Ua + 388 >> 2] = d[Ta + 194 >> 0]
                                                            }
                                                            bc(ia, c[Ta + 52 >> 2] | 0);
                                                            if (a[Ta + 12941 >> 0] | 0) {
                                                                Ua = c[wa >> 2] | 0;
                                                                Va = (c[Ua + 4 >> 2] | 0) != 0 ? 3 : 1;
                                                                ab = (1 << c[Ua + 13080 >> 2]) + 2 | 0;
                                                                ab = $(ab, ab) | 0;
                                                                c[ja >> 2] = fd(ab << c[Ua + 56 >> 2]) | 0;
                                                                Ua = 0;
                                                                do {
                                                                    ab = c[wa >> 2] | 0;
                                                                    $a = c[ab + 13124 >> 2] >> c[ab + (Ua << 2) + 13180 >> 2];
                                                                    _a = $(c[ab + 13120 >> 2] >> c[ab + (Ua << 2) + 13168 >> 2] << 1, c[ab + 13132 >> 2] | 0) | 0;
                                                                    c[m + (Ua << 2) + 172 >> 2] = fd(_a << c[ab + 56 >> 2]) | 0;
                                                                    ab = c[wa >> 2] | 0;
                                                                    $a = $($a << 1, c[ab + 13128 >> 2] | 0) | 0;
                                                                    c[m + (Ua << 2) + 184 >> 2] = fd($a << c[ab + 56 >> 2]) | 0;
                                                                    Ua = Ua + 1 | 0
                                                                } while ((Ua | 0) < (Va | 0))
                                                            }
                                                            c[wa >> 2] = Ta;
                                                            c[ka >> 2] = c[(c[m + (c[Ta >> 2] << 2) + 208 >> 2] | 0) + 4 >> 2];
                                                            b[ma >> 1] = (e[ma >> 1] | 0) + 1 & 255;
                                                            c[na >> 2] = 2147483647
                                                        }
                                                        ab = c[la >> 2] | 0;
                                                        c[ab + 832 >> 2] = d[Ta + 302 >> 0];
                                                        c[ab + 836 >> 2] = d[Ta + 335 >> 0];
                                                        a[Ka >> 0] = 0;
                                                        do
                                                            if (!(a[Ga >> 0] | 0)) {
                                                                if (a[(c[Fa >> 2] | 0) + 41 >> 0] | 0) {
                                                                    a[Ka >> 0] = bd(Sa) | 0;
                                                                    Ta = c[wa >> 2] | 0
                                                                }
                                                                Ta = ($(c[Ta + 13128 >> 2] << 1, c[Ta + 13132 >> 2] | 0) | 0) + -2 | 0;
                                                                Ua = Ta >>> 0 > 65535;
                                                                Ta = Ua ? Ta >>> 16 : Ta;
                                                                Ua = Ua ? 16 : 0;
                                                                if (Ta & 65280) {
                                                                    Ua = Ua | 8;
                                                                    Ta = Ta >>> 8
                                                                }
                                                                Ta = _c(Sa, (d[4680 + Ta >> 0] | 0) + Ua | 0) | 0;
                                                                c[La >> 2] = Ta;
                                                                ab = c[wa >> 2] | 0;
                                                                if (Ta >>> 0 >= ($(c[ab + 13132 >> 2] | 0, c[ab + 13128 >> 2] | 0) | 0) >>> 0) {
                                                                    p = B;
                                                                    o = 180;
                                                                    break a
                                                                }
                                                                if (a[Ka >> 0] | 0)
                                                                    if (!(a[Ia >> 0] | 0)) {
                                                                        p = B;
                                                                        o = 180;
                                                                        break a
                                                                    } else break;
                                                                else {
                                                                    c[Pa >> 2] = Ta;
                                                                    c[Qa >> 2] = (c[Qa >> 2] | 0) + 1;
                                                                    o = 82;
                                                                    break
                                                                }
                                                            } else {
                                                                c[Pa >> 2] = 0;
                                                                c[La >> 2] = 0;
                                                                c[Qa >> 2] = 0;
                                                                a[Ia >> 0] = 0;
                                                                o = 82
                                                            }
                                                        while (0);
                                                        f: do
                                                            if ((o | 0) == 82) {
                                                                o = 0;
                                                                a[Ia >> 0] = 0;
                                                                if ((c[(c[Fa >> 2] | 0) + 1624 >> 2] | 0) > 0) {
                                                                    Ta = 0;
                                                                    do {
                                                                        ad(Sa, 1);
                                                                        Ta = Ta + 1 | 0
                                                                    } while ((Ta | 0) < (c[(c[Fa >> 2] | 0) + 1624 >> 2] | 0))
                                                                }
                                                                Ta = dd(Sa) | 0;
                                                                c[ra >> 2] = Ta;
                                                                if (Ta >>> 0 >= 3) {
                                                                    p = B;
                                                                    o = 180;
                                                                    break a
                                                                }
                                                                if (!((Ta | 0) == 2 ? 1 : ((c[t >> 2] | 0) + -16 | 0) >>> 0 > 7)) {
                                                                    p = B;
                                                                    o = 180;
                                                                    break a
                                                                }
                                                                a[I >> 0] = 1;
                                                                if (a[(c[Fa >> 2] | 0) + 39 >> 0] | 0) a[I >> 0] = bd(Sa) | 0;
                                                                if (a[(c[wa >> 2] | 0) + 8 >> 0] | 0) a[J >> 0] = _c(Sa, 2) | 0;
                                                                if (((c[t >> 2] | 0) + -19 | 0) >>> 0 >= 2) {
                                                                    o = 91;
                                                                    break b
                                                                }
                                                                c[L >> 2] = 0;
                                                                c[va >> 2] = 0;
                                                                if (!(c[K >> 2] | 0)) c[M >> 2] = 0;
                                                                do
                                                                    if (a[(c[wa >> 2] | 0) + 12941 >> 0] | 0) {
                                                                        a[W >> 0] = bd(Sa) | 0;
                                                                        if (!(c[(c[wa >> 2] | 0) + 4 >> 2] | 0)) {
                                                                            a[X >> 0] = 0;
                                                                            a[N >> 0] = 0;
                                                                            break
                                                                        } else {
                                                                            ab = (bd(Sa) | 0) & 255;
                                                                            a[N >> 0] = ab;
                                                                            a[X >> 0] = ab;
                                                                            break
                                                                        }
                                                                    } else {
                                                                        a[W >> 0] = 0;
                                                                        a[X >> 0] = 0;
                                                                        a[N >> 0] = 0
                                                                    }
                                                                while (0);
                                                                c[P >> 2] = 0;
                                                                c[O >> 2] = 0;
                                                                c[Na >> 2] = ed(Sa) | 0;
                                                                Ta = c[Fa >> 2] | 0;
                                                                if (!(a[Ta + 36 >> 0] | 0)) {
                                                                    c[S >> 2] = 0;
                                                                    c[Q >> 2] = 0
                                                                } else {
                                                                    c[S >> 2] = ed(Sa) | 0;
                                                                    c[Q >> 2] = ed(Sa) | 0;
                                                                    Ta = c[Fa >> 2] | 0
                                                                }
                                                                if (!(a[Ta + 1631 >> 0] | 0)) a[T >> 0] = 0;
                                                                else {
                                                                    a[T >> 0] = bd(Sa) | 0;
                                                                    Ta = c[Fa >> 2] | 0
                                                                }
                                                                g: do
                                                                    if (!(a[Ta + 55 >> 0] | 0)) {
                                                                        a[Y >> 0] = 0;
                                                                        c[V >> 2] = 0;
                                                                        c[U >> 2] = 0
                                                                    } else {
                                                                        do
                                                                            if (a[Ta + 56 >> 0] | 0) {
                                                                                if (!(bd(Sa) | 0)) {
                                                                                    Ta = c[Fa >> 2] | 0;
                                                                                    break
                                                                                }
                                                                                ab = (bd(Sa) | 0) & 255;
                                                                                a[Y >> 0] = ab;
                                                                                if (ab << 24 >> 24) break g;
                                                                                c[V >> 2] = (ed(Sa) | 0) << 1;
                                                                                c[U >> 2] = (ed(Sa) | 0) << 1;
                                                                                break g
                                                                            }
                                                                        while (0);
                                                                        a[Y >> 0] = a[Ta + 57 >> 0] | 0;
                                                                        c[V >> 2] = c[Ta + 60 >> 2];
                                                                        c[U >> 2] = c[Ta + 64 >> 2]
                                                                    }
                                                                while (0);
                                                                Ta = a[(c[Fa >> 2] | 0) + 54 >> 0] | 0;
                                                                h: do
                                                                    if (Ta << 24 >> 24) {
                                                                        do
                                                                            if (!(a[W >> 0] | 0)) {
                                                                                if (a[X >> 0] | 0) break;
                                                                                if (a[Y >> 0] | 0) break h
                                                                            }
                                                                        while (0);
                                                                        a[Z >> 0] = bd(Sa) | 0;
                                                                        break f
                                                                    }
                                                                while (0);
                                                                a[Z >> 0] = Ta
                                                            }
                                                        while (0);
                                                        c[Oa >> 2] = 0;
                                                        ab = c[Fa >> 2] | 0;
                                                        if (!((a[ab + 42 >> 0] | 0) == 0 ? (a[ab + 43 >> 0] | 0) == 0 : 0)) o = 122;
                                                        i: do
                                                            if ((o | 0) == 122) {
                                                                o = 0;
                                                                ab = dd(Sa) | 0;
                                                                c[Oa >> 2] = ab;
                                                                if ((ab | 0) <= 0) {
                                                                    c[H >> 2] = 0;
                                                                    break
                                                                }
                                                                Ta = (dd(Sa) | 0) + 1 | 0;
                                                                Ua = Ta >> 4;
                                                                Ta = Ta & 15;
                                                                jd(R);
                                                                jd(F);
                                                                jd(E);
                                                                c[R >> 2] = od(c[Oa >> 2] | 0, 4) | 0;
                                                                c[F >> 2] = od(c[Oa >> 2] | 0, 4) | 0;
                                                                Va = od(c[Oa >> 2] | 0, 4) | 0;
                                                                c[E >> 2] = Va;
                                                                if (!(c[R >> 2] | 0)) {
                                                                    o = 127;
                                                                    break b
                                                                }
                                                                if ((c[F >> 2] | 0) == 0 | (Va | 0) == 0) {
                                                                    o = 127;
                                                                    break b
                                                                }
                                                                if ((c[Oa >> 2] | 0) > 0) {
                                                                    Xa = (Ua | 0) > 0;
                                                                    Wa = (Ta | 0) == 0;
                                                                    Va = 0;
                                                                    do {
                                                                        if (Xa) {
                                                                            Ya = 0;
                                                                            Za = 0;
                                                                            do {
                                                                                Za = (_c(Sa, 16) | 0) + (Za << 16) | 0;
                                                                                Ya = Ya + 1 | 0
                                                                            } while ((Ya | 0) != (Ua | 0))
                                                                        } else Za = 0;
                                                                        if (!Wa) Za = (_c(Sa, Ta) | 0) + (Za << Ta) | 0;
                                                                        c[(c[R >> 2] | 0) + (Va << 2) >> 2] = Za + 1;
                                                                        Va = Va + 1 | 0
                                                                    } while ((Va | 0) < (c[Oa >> 2] | 0))
                                                                }
                                                                do
                                                                    if ((d[G >> 0] | 0) > 1) {
                                                                        ab = c[Fa >> 2] | 0;
                                                                        if ((c[ab + 48 >> 2] | 0) <= 1 ? (c[ab + 44 >> 2] | 0) <= 1 : 0) break;
                                                                        c[H >> 2] = 0;
                                                                        a[G >> 0] = 1;
                                                                        break i
                                                                    }
                                                                while (0);
                                                                c[H >> 2] = 0
                                                            }
                                                        while (0);
                                                        Ta = c[Fa >> 2] | 0;
                                                        if (a[Ta + 1628 >> 0] | 0) {
                                                            Ta = dd(Sa) | 0;
                                                            $a = de(Ta | 0, 0, 3) | 0;
                                                            Za = D;
                                                            ab = (c[Ra + 216 >> 2] | 0) - (c[Ra + 212 >> 2] | 0) | 0;
                                                            _a = ((ab | 0) < 0) << 31 >> 31;
                                                            if ((Za | 0) > (_a | 0) | (Za | 0) == (_a | 0) & $a >>> 0 > ab >>> 0) {
                                                                p = B;
                                                                o = 180;
                                                                break a
                                                            }
                                                            if (Ta) {
                                                                Ua = 0;
                                                                do {
                                                                    ad(Sa, 8);
                                                                    Ua = Ua + 1 | 0
                                                                } while ((Ua | 0) != (Ta | 0))
                                                            }
                                                            Ta = c[Fa >> 2] | 0
                                                        }
                                                        Sa = (c[Ta + 16 >> 2] | 0) + 26 + (c[Na >> 2] | 0) | 0;
                                                        a[Ja >> 0] = Sa;
                                                        Sa = Sa << 24;
                                                        if ((Sa | 0) > 855638016) {
                                                            p = B;
                                                            o = 180;
                                                            break a
                                                        }
                                                        if ((Sa >> 24 | 0) < (0 - (c[(c[wa >> 2] | 0) + 13192 >> 2] | 0) | 0)) {
                                                            p = B;
                                                            o = 180;
                                                            break a
                                                        }
                                                        ab = c[La >> 2] | 0;
                                                        c[Ma >> 2] = ab;
                                                        if ((ab | 0) == 0 ? (a[Ka >> 0] | 0) != 0 : 0) {
                                                            p = B;
                                                            o = 180;
                                                            break a
                                                        }
                                                        if (((c[Ra + 216 >> 2] | 0) - (c[Ra + 212 >> 2] | 0) | 0) < 0) {
                                                            p = B;
                                                            o = 180;
                                                            break a
                                                        }
                                                        a[(c[u >> 2] | 0) + 203 >> 0] = (a[Ka >> 0] | 0) == 0 & 1;
                                                        if (!(a[(c[Fa >> 2] | 0) + 22 >> 0] | 0)) a[(c[u >> 2] | 0) + 272 >> 0] = a[Ja >> 0] | 0;
                                                        a[Ia >> 0] = 1;
                                                        a[(c[u >> 2] | 0) + 302 >> 0] = 0;
                                                        a[(c[u >> 2] | 0) + 303 >> 0] = 0;
                                                        Sa = c[na >> 2] | 0;
                                                        Ra = c[t >> 2] | 0;
                                                        j: do
                                                            if ((Sa | 0) == 2147483647) switch (Ra | 0) {
                                                                case 18:
                                                                case 16:
                                                                case 17:
                                                                case 21:
                                                                    {
                                                                        Sa = c[va >> 2] | 0;
                                                                        c[na >> 2] = Sa;
                                                                        break j
                                                                    };
                                                                case 20:
                                                                case 19:
                                                                    {
                                                                        c[na >> 2] = -2147483648;
                                                                        Sa = -2147483648;
                                                                        break j
                                                                    };
                                                                default:
                                                                    {
                                                                        Sa = 2147483647;
                                                                        break j
                                                                    }
                                                            }
                                                            while (0);
                                                        do
                                                            if ((Ra + -8 | 0) >>> 0 < 2) {
                                                                if ((c[va >> 2] | 0) <= (Sa | 0)) {
                                                                    c[oa >> 2] = 0;
                                                                    break c
                                                                }
                                                                if ((Ra | 0) != 9) break;
                                                                c[na >> 2] = -2147483648
                                                            }
                                                        while (0);
                                                        k: do
                                                            if (!(a[Ga >> 0] | 0)) {
                                                                if (!(c[r >> 2] | 0)) {
                                                                    Ra = 0;
                                                                    break d
                                                                }
                                                            } else {
                                                                Sa = c[u >> 2] | 0;
                                                                $a = c[wa >> 2] | 0;
                                                                Ra = c[$a + 13064 >> 2] | 0;
                                                                ab = c[$a + 13120 >> 2] >> Ra;
                                                                Ra = (c[$a + 13124 >> 2] >> Ra) + 1 | 0;
                                                                ce(c[xa >> 2] | 0, 0, $(c[ya >> 2] | 0, c[za >> 2] | 0) | 0) | 0;
                                                                ce(c[Aa >> 2] | 0, 0, $(c[ya >> 2] | 0, c[za >> 2] | 0) | 0) | 0;
                                                                $a = c[wa >> 2] | 0;
                                                                ce(c[Ba >> 2] | 0, 0, $(c[$a + 13152 >> 2] | 0, c[$a + 13148 >> 2] | 0) | 0) | 0;
                                                                $a = c[wa >> 2] | 0;
                                                                ce(c[Ca >> 2] | 0, 0, $((c[$a + 13160 >> 2] | 0) + 1 | 0, (c[$a + 13156 >> 2] | 0) + 1 | 0) | 0) | 0;
                                                                ce(c[Ea >> 2] | 0, -1, $((ab << 2) + 4 | 0, Ra) | 0) | 0;
                                                                c[oa >> 2] = 0;
                                                                c[pa >> 2] = c[t >> 2];
                                                                Ra = c[Fa >> 2] | 0;
                                                                if (a[Ra + 42 >> 0] | 0) c[Sa + 312 >> 2] = c[c[Ra + 1648 >> 2] >> 2] << c[(c[wa >> 2] | 0) + 13080 >> 2];
                                                                Ra = _b(m, sa, c[va >> 2] | 0) | 0;
                                                                do
                                                                    if ((Ra | 0) >= 0) {
                                                                        c[(c[c[r >> 2] >> 2] | 0) + 80 >> 2] = ((c[t >> 2] | 0) + -16 | 0) >>> 0 < 8 & 1;
                                                                        c[(c[sa >> 2] | 0) + 84 >> 2] = 3 - (c[ra >> 2] | 0);
                                                                        yd(c[ua >> 2] | 0);
                                                                        Ra = $b(m, c[ua >> 2] | 0, 0) | 0;
                                                                        if ((Ra | 0) < 0) break;
                                                                        break k
                                                                    }
                                                                while (0);
                                                                if (!(c[r >> 2] | 0)) {
                                                                    o = 167;
                                                                    break b
                                                                }
                                                                c[r >> 2] = 0;
                                                                if ((Ra | 0) < 0) {
                                                                    p = B;
                                                                    break a
                                                                }
                                                            }
                                                        while (0);
                                                        if ((c[t >> 2] | 0) != (c[pa >> 2] | 0)) {
                                                            p = B;
                                                            o = 180;
                                                            break a
                                                        }
                                                        c[q >> 2] = 0;
                                                        c[Ha >> 2] = 1;
                                                        Ra = c[la >> 2] | 0;
                                                        Da[c[Ra + 816 >> 2] & 1](Ra, 1, q, n, 1, 4) | 0;
                                                        Ra = c[n >> 2] | 0;
                                                        ab = c[wa >> 2] | 0;
                                                        if ((Ra | 0) >= ($(c[ab + 13132 >> 2] | 0, c[ab + 13128 >> 2] | 0) | 0)) c[oa >> 2] = 1;
                                                        if ((Ra | 0) < 0) break d;
                                                        else break c
                                                    };
                                                default:
                                                    break c
                                            }
                                        }
                                    while (0);
                                    s = (c[(c[la >> 2] | 0) + 688 >> 2] & 8 | 0) == 0 ? 0 : Ra;
                                    o = 178
                                }
                            while (0);
                            if ((o | 0) == 178 ? (o = 0, (s | 0) < 0) : 0) {
                                p = B;
                                o = 180;
                                break a
                            }
                            C = C + 1 | 0;
                            if ((C | 0) >= (c[w >> 2] | 0)) {
                                p = B;
                                o = 180;
                                break a
                            }
                        }
                        if ((o | 0) == 71) {
                            Nb(m);
                            Nb(m);
                            c[wa >> 2] = 0;
                            p = B;
                            o = 180;
                            break
                        } else if ((o | 0) == 91) ta();
                        else if ((o | 0) == 127) {
                            c[Oa >> 2] = 0;
                            p = B;
                            o = 180;
                            break
                        } else if ((o | 0) == 167) {
                            c[r >> 2] = 0;
                            p = B;
                            break
                        }
                    } else {
                        p = B;
                        o = 180
                    }
                } else {
                    p = 0;
                    o = 180
                }
            while (0);
            if ((p | 0) < 0) {
                ab = p;
                i = k;
                return ab | 0
            }
            n = m + 2604 | 0;
            if (c[n >> 2] | 0) c[n >> 2] = 0;
            m = c[m + 164 >> 2] | 0;
            if (c[m + 304 >> 2] | 0) {
                ab = m + 128 | 0;
                c[ab >> 2] = e[f >> 1];
                c[ab + 4 >> 2] = 0;
                zd(g, m);
                c[h >> 2] = 1
            }
            ab = c[l >> 2] | 0;
            i = k;
            return ab | 0
        }

        function Lb(b) {
            b = b | 0;
            var d = 0,
                e = 0,
                f = 0,
                g = 0,
                h = 0,
                j = 0,
                k = 0,
                l = 0;
            d = i;
            e = c[b + 60 >> 2] | 0;
            Nb(e);
            b = e + 4412 | 0;
            f = e + 4392 | 0;
            if ((c[b >> 2] | 0) > 0) {
                g = 0;
                do {
                    jd((c[f >> 2] | 0) + (g << 2) | 0);
                    g = g + 1 | 0
                } while ((g | 0) < (c[b >> 2] | 0))
            }
            jd(e + 4396 | 0);
            jd(e + 4388 | 0);
            jd(f);
            jd(e + 152 | 0);
            jd(e + 168 | 0);
            jd(e + 172 | 0);
            jd(e + 184 | 0);
            jd(e + 176 | 0);
            jd(e + 188 | 0);
            jd(e + 180 | 0);
            jd(e + 192 | 0);
            xd(e + 164 | 0);
            g = e + 2524 | 0;
            Xb(e, g, -1);
            xd(g);
            g = e + 208 | 0;
            f = 0;
            do {
                vd(g + (f << 2) | 0);
                f = f + 1 | 0
            } while ((f | 0) != 16);
            g = e + 272 | 0;
            f = 0;
            do {
                vd(g + (f << 2) | 0);
                f = f + 1 | 0
            } while ((f | 0) != 32);
            f = e + 400 | 0;
            g = 0;
            do {
                vd(f + (g << 2) | 0);
                g = g + 1 | 0
            } while ((g | 0) != 256);
            c[e + 200 >> 2] = 0;
            c[e + 204 >> 2] = 0;
            c[e + 196 >> 2] = 0;
            vd(e + 1424 | 0);
            jd(e + 2096 | 0);
            jd(e + 2100 | 0);
            jd(e + 2104 | 0);
            h = e + 141 | 0;
            l = a[h >> 0] | 0;
            f = e + 72 | 0;
            if ((l & 255) > 1) {
                g = e + 8 | 0;
                j = 1;
                do {
                    k = f + (j << 2) | 0;
                    if (c[k >> 2] | 0) {
                        jd(k);
                        jd(g + (j << 2) | 0);
                        l = a[h >> 0] | 0
                    }
                    j = j + 1 | 0
                } while ((j | 0) < (l & 255 | 0))
            }
            g = e + 136 | 0;
            if ((c[g >> 2] | 0) == (c[f >> 2] | 0)) c[g >> 2] = 0;
            jd(f);
            f = e + 4404 | 0;
            if ((c[b >> 2] | 0) <= 0) {
                jd(f);
                c[b >> 2] = 0;
                i = d;
                return 0
            }
            e = 0;
            do {
                jd((c[f >> 2] | 0) + (e << 4) | 0);
                e = e + 1 | 0
            } while ((e | 0) < (c[b >> 2] | 0));
            jd(f);
            c[b >> 2] = 0;
            i = d;
            return 0
        }

        function Mb(a) {
            a = a | 0;
            var b = 0;
            b = i;
            a = c[a + 60 >> 2] | 0;
            Zb(a);
            c[a + 2592 >> 2] = 2147483647;
            i = b;
            return
        }

        function Nb(a) {
            a = a | 0;
            var b = 0;
            b = i;
            jd(a + 2504 | 0);
            jd(a + 2508 | 0);
            jd(a + 4332 | 0);
            jd(a + 4336 | 0);
            jd(a + 4340 | 0);
            jd(a + 4344 | 0);
            jd(a + 4348 | 0);
            jd(a + 4316 | 0);
            jd(a + 4328 | 0);
            jd(a + 4352 | 0);
            jd(a + 4320 | 0);
            jd(a + 4324 | 0);
            jd(a + 2096 | 0);
            jd(a + 2104 | 0);
            jd(a + 2100 | 0);
            i = b;
            return
        }

        function Ob(a) {
            a = a | 0;
            var b = 0,
                d = 0,
                e = 0;
            b = i;
            d = (c[a + 136 >> 2] | 0) + 204 | 0;
            if (bd(d) | 0) {
                e = -1094995529;
                i = b;
                return e | 0
            }
            c[a + 2512 >> 2] = _c(d, 6) | 0;
            e = _c(d, 6) | 0;
            d = (_c(d, 3) | 0) + -1 | 0;
            c[a + 2516 >> 2] = d;
            if ((d | 0) < 0) {
                e = -1094995529;
                i = b;
                return e | 0
            }
            e = (e | 0) == 0 & 1;
            i = b;
            return e | 0
        }

        function Pb(e, f) {
            e = e | 0;
            f = f | 0;
            var g = 0,
                h = 0,
                j = 0,
                k = 0,
                l = 0,
                m = 0,
                n = 0,
                o = 0,
                p = 0,
                q = 0,
                r = 0,
                s = 0,
                t = 0,
                u = 0,
                v = 0,
                w = 0,
                x = 0,
                y = 0,
                z = 0,
                A = 0,
                B = 0,
                C = 0,
                D = 0,
                E = 0,
                F = 0,
                G = 0,
                H = 0,
                I = 0,
                J = 0,
                K = 0,
                L = 0,
                M = 0,
                N = 0,
                O = 0,
                P = 0,
                Q = 0,
                R = 0,
                S = 0,
                T = 0,
                U = 0,
                V = 0,
                W = 0;
            f = i;
            h = c[e + 60 >> 2] | 0;
            k = h + 200 | 0;
            E = c[k >> 2] | 0;
            e = 1 << c[E + 13080 >> 2];
            l = h + 204 | 0;
            n = c[l >> 2] | 0;
            A = c[(c[n + 1668 >> 2] | 0) + (c[h + 2500 >> 2] << 2) >> 2] | 0;
            m = (a[h + 1449 >> 0] | 0) == 0;
            if (!A)
                if (m) g = 4;
                else {
                    W = -1094995529;
                    i = f;
                    return W | 0
                } else if (!m) {
                m = h + 4328 | 0;
                r = h + 1436 | 0;
                if ((c[(c[m >> 2] | 0) + (c[(c[n + 1672 >> 2] | 0) + (A + -1 << 2) >> 2] << 2) >> 2] | 0) != (c[r >> 2] | 0)) {
                    W = -1094995529;
                    i = f;
                    return W | 0
                }
            } else g = 4;
            if ((g | 0) == 4) {
                m = h + 4328 | 0;
                r = h + 1436 | 0
            }
            q = e + -1 | 0;
            s = h + 136 | 0;
            p = h + 2504 | 0;
            y = h + 2056 | 0;
            o = h + 2057 | 0;
            w = h + 2084 | 0;
            x = h + 2508 | 0;
            v = h + 2088 | 0;
            u = h + 2062 | 0;
            t = h + 4352 | 0;
            z = 0;
            n = 0;
            do {
                if ((A | 0) >= (c[E + 13136 >> 2] | 0)) break;
                G = c[l >> 2] | 0;
                B = c[(c[G + 1672 >> 2] | 0) + (A << 2) >> 2] | 0;
                J = E + 13120 | 0;
                I = E + 13080 | 0;
                H = c[I >> 2] | 0;
                n = q + (c[J >> 2] | 0) >> H;
                z = ((B | 0) % (n | 0) | 0) << H;
                n = ((B | 0) / (n | 0) | 0) << H;
                C = c[s >> 2] | 0;
                H = 1 << H;
                F = c[r >> 2] | 0;
                D = B - F | 0;
                c[(c[m >> 2] | 0) + (B << 2) >> 2] = F;
                do
                    if (!(a[G + 43 >> 0] | 0)) {
                        if (!(a[G + 42 >> 0] | 0)) {
                            c[C + 312 >> 2] = c[J >> 2];
                            G = E;
                            break
                        }
                        if ((A | 0) != 0 ? (W = c[G + 1676 >> 2] | 0, (c[W + (A << 2) >> 2] | 0) != (c[W + (A + -1 << 2) >> 2] | 0)) : 0) {
                            W = c[I >> 2] | 0;
                            c[C + 312 >> 2] = (c[(c[G + 1648 >> 2] | 0) + (c[(c[G + 1664 >> 2] | 0) + (z >> W << 2) >> 2] << 2) >> 2] << W) + z;
                            a[C + 203 >> 0] = 1;
                            G = c[k >> 2] | 0
                        } else G = E
                    } else {
                        if ((z | 0) == 0 ? (H + -1 & n | 0) == 0 : 0) {
                            a[C + 203 >> 0] = 1;
                            E = c[k >> 2] | 0
                        }
                        c[C + 312 >> 2] = c[E + 13120 >> 2];
                        G = E
                    }
                while (0);
                E = H + n | 0;
                H = c[G + 13124 >> 2] | 0;
                c[C + 316 >> 2] = (E | 0) > (H | 0) ? H : E;
                E = C + 31312 | 0;
                c[E >> 2] = 0;
                H = c[l >> 2] | 0;
                if (!(a[H + 42 >> 0] | 0)) {
                    if ((B | 0) == (F | 0)) {
                        c[E >> 2] = 1;
                        F = 1
                    } else F = 0;
                    if ((D | 0) < (c[G + 13128 >> 2] | 0)) {
                        F = F | 4;
                        c[E >> 2] = F
                    }
                } else {
                    if ((z | 0) > 0) {
                        W = c[H + 1676 >> 2] | 0;
                        I = B + -1 | 0;
                        if ((c[W + (A << 2) >> 2] | 0) == (c[W + (c[(c[H + 1668 >> 2] | 0) + (I << 2) >> 2] << 2) >> 2] | 0)) F = 0;
                        else {
                            c[E >> 2] = 2;
                            F = 2
                        }
                        W = c[m >> 2] | 0;
                        if ((c[W + (B << 2) >> 2] | 0) != (c[W + (I << 2) >> 2] | 0)) {
                            F = F | 1;
                            c[E >> 2] = F
                        }
                    } else F = 0;
                    if ((n | 0) > 0) {
                        W = c[H + 1676 >> 2] | 0;
                        I = G + 13128 | 0;
                        G = c[I >> 2] | 0;
                        if ((c[W + (A << 2) >> 2] | 0) != (c[W + (c[(c[H + 1668 >> 2] | 0) + (B - G << 2) >> 2] << 2) >> 2] | 0)) {
                            F = F | 8;
                            c[E >> 2] = F;
                            G = c[I >> 2] | 0
                        }
                        W = c[m >> 2] | 0;
                        if ((c[W + (B << 2) >> 2] | 0) != (c[W + (B - G << 2) >> 2] | 0)) {
                            F = F | 4;
                            c[E >> 2] = F
                        }
                    }
                }
                E = (z | 0) > 0;
                if (E & (D | 0) > 0) G = (F >>> 1 & 1 ^ 1) & 255;
                else G = 0;
                a[C + 308 >> 0] = G;
                if ((n | 0) > 0) {
                    if ((D | 0) < (c[(c[k >> 2] | 0) + 13128 >> 2] | 0)) F = 0;
                    else F = (F >>> 3 & 1 ^ 1) & 255;
                    a[C + 309 >> 0] = F;
                    F = c[(c[k >> 2] | 0) + 13128 >> 2] | 0;
                    if ((D + 1 | 0) < (F | 0)) F = 0;
                    else {
                        W = c[l >> 2] | 0;
                        V = c[W + 1676 >> 2] | 0;
                        F = (c[V + (A << 2) >> 2] | 0) == (c[V + (c[(c[W + 1668 >> 2] | 0) + (B + 1 - F << 2) >> 2] << 2) >> 2] | 0) & 1
                    }
                    a[C + 310 >> 0] = F;
                    if (E ? (j = c[(c[k >> 2] | 0) + 13128 >> 2] | 0, (D | 0) > (j | 0)) : 0) {
                        D = c[l >> 2] | 0;
                        W = c[D + 1676 >> 2] | 0;
                        D = (c[W + (A << 2) >> 2] | 0) == (c[W + (c[(c[D + 1668 >> 2] | 0) + (B + -1 - j << 2) >> 2] << 2) >> 2] | 0) & 1
                    } else D = 0
                } else {
                    a[C + 309 >> 0] = 0;
                    a[C + 310 >> 0] = 0;
                    D = 0
                }
                a[C + 311 >> 0] = D;
                Ua(h, A);
                D = c[k >> 2] | 0;
                E = c[D + 13080 >> 2] | 0;
                F = z >> E;
                E = n >> E;
                G = c[s >> 2] | 0;
                D = ($(c[D + 13128 >> 2] | 0, E) | 0) + F | 0;
                C = c[p >> 2] | 0;
                if ((a[y >> 0] | 0) == 0 ? (a[o >> 0] | 0) == 0 : 0) {
                    M = 0;
                    H = 0
                } else {
                    if ((F | 0) > 0 ? (a[G + 308 >> 0] | 0) != 0 : 0) M = Za(h) | 0;
                    else M = 0;
                    if ((E | 0) > 0 & (M | 0) == 0)
                        if (!(a[G + 309 >> 0] | 0)) {
                            M = 0;
                            H = 0
                        } else {
                            M = 0;
                            H = (Za(h) | 0) != 0
                        } else H = 0
                }
                I = (c[(c[k >> 2] | 0) + 4 >> 2] | 0) != 0 ? 3 : 1;
                L = C + (D * 148 | 0) + 143 | 0;
                G = C + (D * 148 | 0) + 144 | 0;
                K = C + (D * 148 | 0) + 104 | 0;
                J = C + (D * 148 | 0) + 108 | 0;
                R = (M | 0) == 0;
                S = R & (H ^ 1);
                M = E + -1 | 0;
                O = F + -1 | 0;
                P = 0;
                do {
                    Q = c[l >> 2] | 0;
                    Q = d[((P | 0) == 0 ? Q + 1644 | 0 : Q + 1645 | 0) >> 0] | 0;
                    a: do
                        if (a[h + P + 2056 >> 0] | 0) {
                            T = (P | 0) == 2;
                            do
                                if (!T) {
                                    if (S) {
                                        U = ($a(h) | 0) & 255;
                                        N = C + (D * 148 | 0) + P + 142 | 0;
                                        a[N >> 0] = U;
                                        break
                                    }
                                    if (!R) {
                                        U = ($(c[(c[k >> 2] | 0) + 13128 >> 2] | 0, E) | 0) + O | 0;
                                        U = a[(c[p >> 2] | 0) + (U * 148 | 0) + P + 142 >> 0] | 0;
                                        N = C + (D * 148 | 0) + P + 142 | 0;
                                        a[N >> 0] = U;
                                        break
                                    }
                                    if (H) {
                                        U = ($(c[(c[k >> 2] | 0) + 13128 >> 2] | 0, M) | 0) + F | 0;
                                        U = a[(c[p >> 2] | 0) + (U * 148 | 0) + P + 142 >> 0] | 0;
                                        N = C + (D * 148 | 0) + P + 142 | 0;
                                        a[N >> 0] = U;
                                        break
                                    } else {
                                        a[C + (D * 148 | 0) + P + 142 >> 0] = 0;
                                        break a
                                    }
                                } else {
                                    U = a[L >> 0] | 0;
                                    a[G >> 0] = U;
                                    c[J >> 2] = c[K >> 2];
                                    N = G
                                }
                            while (0);
                            if (U << 24 >> 24) {
                                U = 0;
                                do {
                                    do
                                        if (!S) {
                                            if (!R) {
                                                W = ($(c[(c[k >> 2] | 0) + 13128 >> 2] | 0, E) | 0) + O | 0;
                                                c[C + (D * 148 | 0) + (P << 4) + (U << 2) >> 2] = c[(c[p >> 2] | 0) + (W * 148 | 0) + (P << 4) + (U << 2) >> 2];
                                                break
                                            }
                                            if (H) {
                                                W = ($(c[(c[k >> 2] | 0) + 13128 >> 2] | 0, M) | 0) + F | 0;
                                                c[C + (D * 148 | 0) + (P << 4) + (U << 2) >> 2] = c[(c[p >> 2] | 0) + (W * 148 | 0) + (P << 4) + (U << 2) >> 2];
                                                break
                                            } else {
                                                c[C + (D * 148 | 0) + (P << 4) + (U << 2) >> 2] = 0;
                                                break
                                            }
                                        } else c[C + (D * 148 | 0) + (P << 4) + (U << 2) >> 2] = cb(h) | 0;
                                    while (0);
                                    U = U + 1 | 0
                                } while ((U | 0) != 4);
                                do
                                    if ((a[N >> 0] | 0) == 1) {
                                        T = 0;
                                        do {
                                            do
                                                if (c[C + (D * 148 | 0) + (P << 4) + (T << 2) >> 2] | 0) {
                                                    if (S) {
                                                        c[C + (D * 148 | 0) + (P << 4) + (T << 2) + 48 >> 2] = db(h) | 0;
                                                        break
                                                    }
                                                    if (!R) {
                                                        W = ($(c[(c[k >> 2] | 0) + 13128 >> 2] | 0, E) | 0) + O | 0;
                                                        c[C + (D * 148 | 0) + (P << 4) + (T << 2) + 48 >> 2] = c[(c[p >> 2] | 0) + (W * 148 | 0) + (P << 4) + (T << 2) + 48 >> 2];
                                                        break
                                                    }
                                                    if (H) {
                                                        W = ($(c[(c[k >> 2] | 0) + 13128 >> 2] | 0, M) | 0) + F | 0;
                                                        c[C + (D * 148 | 0) + (P << 4) + (T << 2) + 48 >> 2] = c[(c[p >> 2] | 0) + (W * 148 | 0) + (P << 4) + (T << 2) + 48 >> 2];
                                                        break
                                                    } else {
                                                        c[C + (D * 148 | 0) + (P << 4) + (T << 2) + 48 >> 2] = 0;
                                                        break
                                                    }
                                                } else c[C + (D * 148 | 0) + (P << 4) + (T << 2) + 48 >> 2] = 0;
                                            while (0);
                                            T = T + 1 | 0
                                        } while ((T | 0) != 4);
                                        if (S) {
                                            a[C + (D * 148 | 0) + P + 96 >> 0] = bb(h) | 0;
                                            break
                                        }
                                        if (!R) {
                                            W = ($(c[(c[k >> 2] | 0) + 13128 >> 2] | 0, E) | 0) + O | 0;
                                            a[C + (D * 148 | 0) + P + 96 >> 0] = a[(c[p >> 2] | 0) + (W * 148 | 0) + P + 96 >> 0] | 0;
                                            break
                                        }
                                        if (H) {
                                            W = ($(c[(c[k >> 2] | 0) + 13128 >> 2] | 0, M) | 0) + F | 0;
                                            a[C + (D * 148 | 0) + P + 96 >> 0] = a[(c[p >> 2] | 0) + (W * 148 | 0) + P + 96 >> 0] | 0;
                                            break
                                        } else {
                                            a[C + (D * 148 | 0) + P + 96 >> 0] = 0;
                                            break
                                        }
                                    } else if (!T) {
                                    if (S) {
                                        c[C + (D * 148 | 0) + (P << 2) + 100 >> 2] = eb(h) | 0;
                                        break
                                    }
                                    if (!R) {
                                        W = ($(c[(c[k >> 2] | 0) + 13128 >> 2] | 0, E) | 0) + O | 0;
                                        c[C + (D * 148 | 0) + (P << 2) + 100 >> 2] = c[(c[p >> 2] | 0) + (W * 148 | 0) + (P << 2) + 100 >> 2];
                                        break
                                    }
                                    if (H) {
                                        W = ($(c[(c[k >> 2] | 0) + 13128 >> 2] | 0, M) | 0) + F | 0;
                                        c[C + (D * 148 | 0) + (P << 2) + 100 >> 2] = c[(c[p >> 2] | 0) + (W * 148 | 0) + (P << 2) + 100 >> 2];
                                        break
                                    } else {
                                        c[C + (D * 148 | 0) + (P << 2) + 100 >> 2] = 0;
                                        break
                                    }
                                } while (0);
                                b[C + (D * 148 | 0) + (P * 10 | 0) + 112 >> 1] = 0;
                                T = 0;
                                do {
                                    W = c[C + (D * 148 | 0) + (P << 4) + (T << 2) >> 2] | 0;
                                    V = T;
                                    T = T + 1 | 0;
                                    U = C + (D * 148 | 0) + (P * 10 | 0) + (T << 1) + 112 | 0;
                                    b[U >> 1] = W;
                                    if ((a[N >> 0] | 0) == 2) {
                                        if ((V | 0) > 1) {
                                            W = 0 - W | 0;
                                            b[U >> 1] = W
                                        }
                                    } else if (c[C + (D * 148 | 0) + (P << 4) + (V << 2) + 48 >> 2] | 0) {
                                        W = 0 - W | 0;
                                        b[U >> 1] = W
                                    }
                                    b[U >> 1] = W << 16 >> 16 << Q
                                } while ((T | 0) != 4)
                            }
                        } else a[C + (D * 148 | 0) + P + 142 >> 0] = 0;
                    while (0);
                    P = P + 1 | 0
                } while ((P | 0) < (I | 0));
                C = c[x >> 2] | 0;
                c[C + (B << 3) >> 2] = c[w >> 2];
                c[C + (B << 3) + 4 >> 2] = c[v >> 2];
                a[(c[t >> 2] | 0) + B >> 0] = a[u >> 0] | 0;
                C = Qb(h, z, n, c[(c[k >> 2] | 0) + 13080 >> 2] | 0, 0) | 0;
                if ((C | 0) < 0) {
                    g = 108;
                    break
                }
                A = A + 1 | 0;
                Ta(h, A);
                Db(h, z, n, e);
                E = c[k >> 2] | 0
            } while ((C | 0) != 0);
            if ((g | 0) == 108) {
                c[(c[m >> 2] | 0) + (B << 2) >> 2] = -1;
                W = C;
                i = f;
                return W | 0
            }
            if ((z + e | 0) < (c[E + 13120 >> 2] | 0)) {
                W = A;
                i = f;
                return W | 0
            }
            if ((n + e | 0) < (c[E + 13124 >> 2] | 0)) {
                W = A;
                i = f;
                return W | 0
            }
            Bb(h, z, n, e);
            W = A;
            i = f;
            return W | 0
        }

        function Qb(b, e, f, g, h) {
            b = b | 0;
            e = e | 0;
            f = f | 0;
            g = g | 0;
            h = h | 0;
            var j = 0,
                k = 0,
                l = 0,
                m = 0,
                n = 0,
                o = 0,
                p = 0,
                q = 0,
                r = 0,
                s = 0,
                t = 0,
                u = 0,
                v = 0,
                w = 0,
                x = 0,
                y = 0,
                z = 0,
                A = 0,
                B = 0,
                C = 0,
                D = 0,
                E = 0,
                F = 0,
                G = 0,
                H = 0,
                I = 0,
                J = 0,
                K = 0,
                L = 0,
                M = 0,
                N = 0,
                O = 0,
                P = 0,
                Q = 0,
                R = 0,
                S = 0,
                T = 0,
                U = 0,
                V = 0,
                W = 0,
                X = 0;
            j = i;
            i = i + 32 | 0;
            z = j;
            B = j + 20 | 0;
            A = b + 136 | 0;
            r = c[A >> 2] | 0;
            l = 1 << g;
            m = b + 200 | 0;
            s = c[m >> 2] | 0;
            q = b + 204 | 0;
            t = c[q >> 2] | 0;
            p = (1 << (c[s + 13080 >> 2] | 0) - (c[t + 24 >> 2] | 0)) + -1 | 0;
            c[r + 31232 >> 2] = h;
            k = l + e | 0;
            if (((k | 0) <= (c[s + 13120 >> 2] | 0) ? (l + f | 0) <= (c[s + 13124 >> 2] | 0) : 0) ? (c[s + 13064 >> 2] | 0) >>> 0 < g >>> 0 : 0) {
                s = lb(b, h, e, f) | 0;
                t = c[q >> 2] | 0
            } else s = (c[s + 13064 >> 2] | 0) >>> 0 < g >>> 0 & 1;
            if ((a[t + 22 >> 0] | 0) != 0 ? ((c[(c[m >> 2] | 0) + 13080 >> 2] | 0) - (c[t + 24 >> 2] | 0) | 0) >>> 0 <= g >>> 0 : 0) {
                a[r + 300 >> 0] = 0;
                c[r + 280 >> 2] = 0
            }
            if ((a[b + 2080 >> 0] | 0) != 0 ? ((c[(c[m >> 2] | 0) + 13080 >> 2] | 0) - (d[(c[q >> 2] | 0) + 1632 >> 0] | 0) | 0) >>> 0 <= g >>> 0 : 0) a[r + 301 >> 0] = 0;
            if (s) {
                n = l >> 1;
                o = n + e | 0;
                q = n + f | 0;
                g = g + -1 | 0;
                h = h + 1 | 0;
                s = Qb(b, e, f, g, h) | 0;
                if ((s | 0) < 0) {
                    X = s;
                    i = j;
                    return X | 0
                }
                if (s) {
                    if ((o | 0) < (c[(c[m >> 2] | 0) + 13120 >> 2] | 0)) {
                        s = Qb(b, o, f, g, h) | 0;
                        if ((s | 0) < 0) {
                            X = s;
                            i = j;
                            return X | 0
                        }
                    }
                    if (s) {
                        if ((q | 0) < (c[(c[m >> 2] | 0) + 13124 >> 2] | 0)) {
                            s = Qb(b, e, q, g, h) | 0;
                            if ((s | 0) < 0) {
                                X = s;
                                i = j;
                                return X | 0
                            }
                        }
                        if (s) {
                            X = c[m >> 2] | 0;
                            if ((o | 0) < (c[X + 13120 >> 2] | 0) ? (q | 0) < (c[X + 13124 >> 2] | 0) : 0) {
                                s = Qb(b, o, q, g, h) | 0;
                                if ((s | 0) < 0) {
                                    X = s;
                                    i = j;
                                    return X | 0
                                }
                            }
                        } else s = 0
                    } else s = 0
                } else s = 0;
                if ((p & k | 0) == 0 ? (p & l + f | 0) == 0 : 0) c[r + 276 >> 2] = a[r + 272 >> 0];
                if (!s) {
                    X = 0;
                    i = j;
                    return X | 0
                }
                k = c[m >> 2] | 0;
                if ((o + n | 0) < (c[k + 13120 >> 2] | 0)) k = 1;
                else k = (q + n | 0) < (c[k + 13124 >> 2] | 0);
                X = k & 1;
                i = j;
                return X | 0
            }
            p = c[A >> 2] | 0;
            s = c[m >> 2] | 0;
            r = c[s + 13064 >> 2] | 0;
            h = c[s + 13140 >> 2] | 0;
            s = 1 << (c[s + 13080 >> 2] | 0) - (c[(c[q >> 2] | 0) + 24 >> 2] | 0);
            c[p + 31236 >> 2] = e;
            c[p + 31240 >> 2] = f;
            x = p + 31252 | 0;
            a[x >> 0] = 1;
            v = p + 31244 | 0;
            c[v >> 2] = 1;
            E = p + 31248 | 0;
            c[E >> 2] = 0;
            w = p + 31254 | 0;
            a[w >> 0] = 0;
            y = p + 31253 | 0;
            a[y >> 0] = 0;
            t = ($(f >> r, h) | 0) + (e >> r) | 0;
            H = b + 4332 | 0;
            a[(c[H >> 2] | 0) + t >> 0] = 0;
            X = p + 31268 | 0;
            a[X >> 0] = 1;
            a[X + 1 >> 0] = 1;
            a[X + 2 >> 0] = 1;
            a[X + 3 >> 0] = 1;
            r = l >> r;
            s = s + -1 | 0;
            if (a[(c[q >> 2] | 0) + 40 >> 0] | 0) {
                X = (gb(b) | 0) & 255;
                a[p + 31256 >> 0] = X;
                if (X << 24 >> 24) Rb(b, e, f, g)
            } else a[p + 31256 >> 0] = 0;
            u = (r | 0) > 0;
            if (u) {
                G = t;
                F = 0;
                while (1) {
                    ce((c[H >> 2] | 0) + G | 0, 0, r | 0) | 0;
                    F = F + 1 | 0;
                    if ((F | 0) == (r | 0)) break;
                    else G = G + h | 0
                }
            }
            if ((c[v >> 2] | 0) == 1 ? (c[(c[m >> 2] | 0) + 13064 >> 2] | 0) != (g | 0) : 0) D = c[E >> 2] | 0;
            else {
                F = mb(b, g) | 0;
                c[E >> 2] = F;
                E = c[v >> 2] | 0;
                if ((F | 0) == 3) G = (E | 0) == 1 & 1;
                else G = 0;
                a[w >> 0] = G;
                if ((E | 0) == 1) D = F;
                else ta()
            }
            if ((((D | 0) == 0 ? (C = c[m >> 2] | 0, (c[C + 68 >> 2] | 0) != 0) : 0) ? (c[C + 13048 >> 2] | 0) >>> 0 <= g >>> 0 : 0) ? (c[C + 13052 >> 2] | 0) >>> 0 >= g >>> 0 : 0) {
                C = (nb(b) | 0) & 255;
                a[y >> 0] = C
            } else C = a[y >> 0] | 0;
            do
                if (!(C << 24 >> 24)) {
                    C = c[A >> 2] | 0;
                    E = (c[C + 31248 >> 2] | 0) == 3;
                    D = E ? 2 : 1;
                    H = 0;
                    do {
                        F = H << 1;
                        G = 0;
                        do {
                            a[B + (G + F) >> 0] = ob(b) | 0;
                            G = G + 1 | 0
                        } while ((G | 0) < (D | 0));
                        H = H + 1 | 0
                    } while ((H | 0) < (D | 0));
                    Q = l >> (E & 1);
                    P = C + 31264 | 0;
                    R = z + 4 | 0;
                    E = z + 8 | 0;
                    F = b + 4340 | 0;
                    O = C + 31260 | 0;
                    N = 0;
                    do {
                        J = N << 1;
                        H = ($(N, Q) | 0) + f | 0;
                        I = 0;
                        do {
                            L = I + J | 0;
                            U = (a[B + L >> 0] | 0) == 0;
                            if (U) c[P >> 2] = qb(b) | 0;
                            else c[O >> 2] = pb(b) | 0;
                            V = ($(I, Q) | 0) + e | 0;
                            T = c[A >> 2] | 0;
                            X = c[m >> 2] | 0;
                            S = c[X + 13084 >> 2] | 0;
                            M = V >> S;
                            K = H >> S;
                            G = c[X + 13156 >> 2] | 0;
                            S = Q >> S;
                            X = c[X + 13080 >> 2] | 0;
                            W = (1 << X) + -1 | 0;
                            V = W & V;
                            if ((a[T + 309 >> 0] | 0) == 0 ? (W & H | 0) == 0 : 0) W = 1;
                            else {
                                W = ($(K + -1 | 0, G) | 0) + M | 0;
                                W = d[(c[F >> 2] | 0) + W >> 0] | 0
                            }
                            if ((a[T + 308 >> 0] | 0) == 0 & (V | 0) == 0) V = 1;
                            else {
                                V = M + -1 + ($(K, G) | 0) | 0;
                                V = d[(c[F >> 2] | 0) + V >> 0] | 0
                            }
                            X = (H >> X << X | 0) < (H | 0) ? W : 1;
                            do
                                if ((V | 0) == (X | 0))
                                    if (V >>> 0 < 2) {
                                        c[z >> 2] = 0;
                                        c[R >> 2] = 1;
                                        c[E >> 2] = 26;
                                        V = 0;
                                        X = 1;
                                        W = 26;
                                        break
                                    } else {
                                        c[z >> 2] = V;
                                        X = (V + 29 & 31) + 2 | 0;
                                        c[R >> 2] = X;
                                        W = (V + 31 & 31) + 2 | 0;
                                        c[E >> 2] = W;
                                        break
                                    } else {
                                c[z >> 2] = V;
                                c[R >> 2] = X;
                                if (!((V | 0) == 0 | (X | 0) == 0)) {
                                    c[E >> 2] = 0;
                                    W = 0;
                                    break
                                }
                                if ((V | 0) == 1 | (X | 0) == 1) {
                                    c[E >> 2] = 26;
                                    W = 26;
                                    break
                                } else {
                                    c[E >> 2] = 1;
                                    W = 1;
                                    break
                                }
                            } while (0);
                            if (U) {
                                if ((V | 0) > (X | 0)) {
                                    c[R >> 2] = V;
                                    U = X & 255;
                                    c[z >> 2] = U
                                } else {
                                    U = V;
                                    V = X
                                }
                                if ((U | 0) > (W | 0)) {
                                    c[E >> 2] = U;
                                    X = W & 255;
                                    c[z >> 2] = X;
                                    W = U;
                                    U = X
                                }
                                if ((V | 0) > (W | 0)) {
                                    c[E >> 2] = V;
                                    X = W & 255;
                                    c[R >> 2] = X
                                } else {
                                    X = V;
                                    V = W
                                }
                                T = c[T + 31264 >> 2] | 0;
                                T = ((T | 0) >= (U | 0) & 1) + T | 0;
                                T = ((T | 0) >= (X | 0) & 1) + T | 0;
                                T = ((T | 0) >= (V | 0) & 1) + T | 0
                            } else T = c[z + (c[T + 31260 >> 2] << 2) >> 2] | 0;
                            S = (S | 0) == 0 ? 1 : S;
                            T = T & 255;
                            if ((S | 0) > 0) {
                                U = 0;
                                do {
                                    X = ($(U + K | 0, G) | 0) + M | 0;
                                    ce((c[F >> 2] | 0) + X | 0, T | 0, S | 0) | 0;
                                    U = U + 1 | 0
                                } while ((U | 0) < (S | 0))
                            }
                            a[C + L + 31268 >> 0] = T;
                            I = I + 1 | 0
                        } while ((I | 0) < (D | 0));
                        N = N + 1 | 0
                    } while ((N | 0) < (D | 0));
                    z = c[(c[m >> 2] | 0) + 4 >> 2] | 0;
                    if ((z | 0) == 3) {
                        B = 0;
                        do {
                            z = B << 1;
                            E = 0;
                            do {
                                G = rb(b) | 0;
                                F = E + z | 0;
                                a[C + F + 31281 >> 0] = G;
                                A = a[C + F + 31268 >> 0] | 0;
                                do
                                    if ((G | 0) != 4) {
                                        G = a[1528 + G >> 0] | 0;
                                        F = C + F + 31277 | 0;
                                        if (A << 24 >> 24 == G << 24 >> 24) {
                                            a[F >> 0] = 34;
                                            break
                                        } else {
                                            a[F >> 0] = G;
                                            break
                                        }
                                    } else a[C + F + 31277 >> 0] = A;
                                while (0);
                                E = E + 1 | 0
                            } while ((E | 0) < (D | 0));
                            B = B + 1 | 0
                        } while ((B | 0) < (D | 0))
                    } else if ((z | 0) == 2) {
                        A = rb(b) | 0;
                        a[C + 31281 >> 0] = A;
                        z = a[C + 31268 >> 0] | 0;
                        if ((A | 0) == 4) z = z & 255;
                        else {
                            X = a[1528 + A >> 0] | 0;
                            z = z << 24 >> 24 == X << 24 >> 24 ? 34 : X & 255
                        }
                        a[C + 31277 >> 0] = a[1536 + z >> 0] | 0;
                        break
                    } else if (z) {
                        A = rb(b) | 0;
                        z = a[C + 31268 >> 0] | 0;
                        if ((A | 0) == 4) {
                            a[C + 31277 >> 0] = z;
                            break
                        }
                        A = a[1528 + A >> 0] | 0;
                        B = C + 31277 | 0;
                        if (z << 24 >> 24 == A << 24 >> 24) {
                            a[B >> 0] = 34;
                            break
                        } else {
                            a[B >> 0] = A;
                            break
                        }
                    } else break
                } else {
                    G = c[m >> 2] | 0;
                    B = c[G + 13084 >> 2] | 0;
                    E = l >> B;
                    C = c[G + 13156 >> 2] | 0;
                    D = e >> B;
                    B = f >> B;
                    E = (E | 0) == 0 ? 1 : E;
                    if ((E | 0) > 0) {
                        F = b + 4340 | 0;
                        G = 0;
                        do {
                            X = ($(G + B | 0, C) | 0) + D | 0;
                            ce((c[F >> 2] | 0) + X | 0, 1, E | 0) | 0;
                            G = G + 1 | 0
                        } while ((G | 0) < (E | 0));
                        G = c[m >> 2] | 0
                    }
                    K = c[A >> 2] | 0;
                    V = c[b + 160 >> 2] | 0;
                    A = c[V + 32 >> 2] | 0;
                    D = $(A, f) | 0;
                    H = c[G + 56 >> 2] | 0;
                    D = (c[V >> 2] | 0) + ((e << H) + D) | 0;
                    E = c[V + 36 >> 2] | 0;
                    J = c[G + 13184 >> 2] | 0;
                    B = $(f >> J, E) | 0;
                    I = c[G + 13172 >> 2] | 0;
                    B = (c[V + 4 >> 2] | 0) + ((e >> I << H) + B) | 0;
                    C = c[V + 40 >> 2] | 0;
                    X = c[G + 13188 >> 2] | 0;
                    F = $(f >> X, C) | 0;
                    W = c[G + 13176 >> 2] | 0;
                    F = (c[V + 8 >> 2] | 0) + ((e >> W << H) + F) | 0;
                    H = $(d[G + 13044 >> 0] | 0, l << g) | 0;
                    J = ($(l >> W, l >> X) | 0) + ($(l >> I, l >> J) | 0) | 0;
                    G = ($(d[G + 13045 >> 0] | 0, J) | 0) + H | 0;
                    H = K + 224 | 0;
                    J = G + 7 >> 3;
                    I = c[K + 240 >> 2] | 0;
                    X = c[H >> 2] | 0;
                    I = (X & 1 | 0) == 0 ? I : I + -1 | 0;
                    I = (X & 511 | 0) == 0 ? I : I + -1 | 0;
                    K = (c[K + 244 >> 2] | 0) - I | 0;
                    if ((K | 0) < (J | 0)) I = 0;
                    else Yc(H, I + J | 0, K - J | 0);
                    if (!(a[b + 2061 >> 0] | 0)) Ab(b, e, f, g);
                    X = G >>> 0 > 2147483639 | (I | 0) == 0;
                    W = X ? 0 : G;
                    V = X ? 0 : I;
                    c[z >> 2] = V;
                    c[z + 12 >> 2] = W;
                    c[z + 16 >> 2] = W + 8;
                    c[z + 4 >> 2] = V + (W + 7 >> 3);
                    c[z + 8 >> 2] = 0;
                    if (X) z = -1094995529;
                    else {
                        W = b + 2608 | 0;
                        X = c[m >> 2] | 0;
                        za[c[W >> 2] & 7](D, A, l, l, z, d[X + 13044 >> 0] | 0, c[X + 52 >> 2] | 0);
                        X = c[m >> 2] | 0;
                        za[c[W >> 2] & 7](B, E, l >> c[X + 13172 >> 2], l >> c[X + 13184 >> 2], z, d[X + 13045 >> 0] | 0, c[X + 52 >> 2] | 0);
                        X = c[m >> 2] | 0;
                        za[c[W >> 2] & 7](F, C, l >> c[X + 13176 >> 2], l >> c[X + 13188 >> 2], z, d[X + 13045 >> 0] | 0, c[X + 52 >> 2] | 0);
                        z = 0
                    }
                    if (a[(c[m >> 2] | 0) + 13056 >> 0] | 0) Rb(b, e, f, g);
                    if ((z | 0) < 0) {
                        X = z;
                        i = j;
                        return X | 0
                    }
                }
            while (0);
            do
                if (!(a[y >> 0] | 0)) {
                    if (!(a[x >> 0] | 0)) {
                        if (a[b + 2061 >> 0] | 0) break;
                        Ab(b, e, f, g);
                        break
                    }
                    x = c[m >> 2] | 0;
                    if ((c[v >> 2] | 0) == 1) v = (d[w >> 0] | 0) + (c[x + 13092 >> 2] | 0) | 0;
                    else v = c[x + 13088 >> 2] | 0;
                    a[p + 31255 >> 0] = v;
                    v = Sb(b, e, f, e, f, e, f, g, g, 0, 0, 1520, 1520) | 0;
                    if ((v | 0) < 0) {
                        X = v;
                        i = j;
                        return X | 0
                    }
                }
            while (0);
            if ((a[(c[q >> 2] | 0) + 22 >> 0] | 0) != 0 ? (a[p + 300 >> 0] | 0) == 0 : 0) zb(b, e, f, g);
            if (u) {
                q = b + 4316 | 0;
                g = p + 272 | 0;
                u = 0;
                while (1) {
                    ce((c[q >> 2] | 0) + t | 0, a[g >> 0] | 0, r | 0) | 0;
                    u = u + 1 | 0;
                    if ((u | 0) == (r | 0)) break;
                    else t = t + h | 0
                }
            }
            if ((s & k | 0) == 0 ? (s & l + f | 0) == 0 : 0) c[p + 276 >> 2] = a[p + 272 >> 0];
            q = c[m >> 2] | 0;
            X = c[q + 13064 >> 2] | 0;
            g = l >> X;
            r = e >> X;
            e = f >> X;
            if ((g | 0) > 0 ? (n = b + 4336 | 0, o = c[p + 31232 >> 2] & 255, X = ($(c[q + 13140 >> 2] | 0, e) | 0) + r | 0, ce((c[n >> 2] | 0) + X | 0, o | 0, g | 0) | 0, (g | 0) != 1) : 0) {
                p = 1;
                do {
                    X = ($(c[(c[m >> 2] | 0) + 13140 >> 2] | 0, p + e | 0) | 0) + r | 0;
                    ce((c[n >> 2] | 0) + X | 0, o | 0, g | 0) | 0;
                    p = p + 1 | 0
                } while ((p | 0) != (g | 0))
            }
            e = c[m >> 2] | 0;
            m = 1 << c[e + 13080 >> 2];
            if (((k | 0) % (m | 0) | 0 | 0) != 0 ? (k | 0) < (c[e + 13120 >> 2] | 0) : 0) {
                X = 1;
                i = j;
                return X | 0
            }
            X = l + f | 0;
            if (((X | 0) % (m | 0) | 0 | 0) != 0 ? (X | 0) < (c[e + 13124 >> 2] | 0) : 0) {
                X = 1;
                i = j;
                return X | 0
            }
            X = (fb(b) | 0) == 0 & 1;
            i = j;
            return X | 0
        }

        function Rb(b, d, e, f) {
            b = b | 0;
            d = d | 0;
            e = e | 0;
            f = f | 0;
            var g = 0,
                h = 0,
                j = 0,
                k = 0,
                l = 0,
                m = 0,
                n = 0;
            g = i;
            m = 1 << f;
            n = c[b + 200 >> 2] | 0;
            l = c[n + 13084 >> 2] | 0;
            f = c[n + 13156 >> 2] | 0;
            k = m + d | 0;
            j = c[n + 13120 >> 2] | 0;
            m = m + e | 0;
            n = c[n + 13124 >> 2] | 0;
            h = e >> l;
            e = ((m | 0) > (n | 0) ? n : m) >> l;
            if ((h | 0) >= (e | 0)) {
                i = g;
                return
            }
            d = d >> l;
            j = ((k | 0) > (j | 0) ? j : k) >> l;
            k = (d | 0) < (j | 0);
            b = b + 4348 | 0;
            do {
                if (k) {
                    m = $(h, f) | 0;
                    l = d;
                    do {
                        a[(c[b >> 2] | 0) + (l + m) >> 0] = 2;
                        l = l + 1 | 0
                    } while ((l | 0) != (j | 0))
                }
                h = h + 1 | 0
            } while ((h | 0) != (e | 0));
            i = g;
            return
        }

        function Sb(e, f, g, h, j, k, l, m, n, o, p, q, r) {
            e = e | 0;
            f = f | 0;
            g = g | 0;
            h = h | 0;
            j = j | 0;
            k = k | 0;
            l = l | 0;
            m = m | 0;
            n = n | 0;
            o = o | 0;
            p = p | 0;
            q = q | 0;
            r = r | 0;
            var s = 0,
                t = 0,
                u = 0,
                v = 0,
                w = 0,
                x = 0,
                y = 0,
                z = 0,
                A = 0,
                B = 0,
                C = 0,
                D = 0,
                E = 0,
                F = 0,
                G = 0,
                H = 0,
                I = 0,
                J = 0,
                K = 0,
                L = 0,
                M = 0;
            s = i;
            i = i + 16 | 0;
            w = s + 8 | 0;
            t = s;
            z = e + 136 | 0;
            v = c[z >> 2] | 0;
            K = c[q >> 2] | 0;
            c[w >> 2] = K;
            A = c[q + 4 >> 2] | 0;
            G = w + 4 | 0;
            c[G >> 2] = A;
            L = c[r >> 2] | 0;
            c[t >> 2] = L;
            q = c[r + 4 >> 2] | 0;
            x = t + 4 | 0;
            c[x >> 2] = q;
            y = a[v + 31254 >> 0] | 0;
            do
                if (y << 24 >> 24) {
                    if ((o | 0) == 1) {
                        c[v + 288 >> 2] = d[v + p + 31268 >> 0];
                        if ((c[(c[e + 200 >> 2] | 0) + 4 >> 2] | 0) == 3) {
                            c[v + 292 >> 2] = d[v + p + 31277 >> 0];
                            c[v + 296 >> 2] = d[v + p + 31281 >> 0];
                            break
                        } else {
                            c[v + 292 >> 2] = d[v + 31277 >> 0];
                            c[v + 296 >> 2] = d[v + 31281 >> 0];
                            break
                        }
                    }
                } else {
                    c[v + 288 >> 2] = d[v + 31268 >> 0];
                    c[v + 292 >> 2] = d[v + 31277 >> 0];
                    c[v + 296 >> 2] = d[v + 31281 >> 0]
                }
            while (0);
            r = e + 200 | 0;
            I = c[r >> 2] | 0;
            B = (c[I + 13076 >> 2] | 0) >>> 0 < n >>> 0;
            if (((!B ? (c[I + 13072 >> 2] | 0) >>> 0 < n >>> 0 : 0) ? (d[v + 31255 >> 0] | 0) > (o | 0) : 0) ? !(y << 24 >> 24 != 0 & (o | 0) == 0) : 0) y = (sb(e, n) | 0) & 255;
            else {
                if ((c[I + 13088 >> 2] | 0) == 0 ? (c[v + 31244 >> 2] | 0) == 0 : 0) I = (o | 0) == 0 & (c[v + 31248 >> 2] | 0) != 0;
                else I = 0;
                if (B) y = 1;
                else y = (y << 24 >> 24 != 0 & (o | 0) == 0 | I) & 1
            }
            B = (n | 0) > 2;
            I = c[(c[r >> 2] | 0) + 4 >> 2] | 0;
            if (B)
                if (!I) {
                    J = q;
                    M = A
                } else E = 20;
            else if ((I | 0) == 3) E = 20;
            else {
                J = q;
                M = A
            }
            do
                if ((E | 0) == 20) {
                    I = (o | 0) == 0;
                    if (!((K | 0) == 0 & (I ^ 1))) {
                        K = tb(e, o) | 0;
                        c[w >> 2] = K;
                        if ((c[(c[r >> 2] | 0) + 4 >> 2] | 0) == 2 ? y << 24 >> 24 == 0 | (n | 0) == 3 : 0) {
                            A = tb(e, o) | 0;
                            c[G >> 2] = A
                        }
                        if (!I) E = 25
                    } else {
                        K = 0;
                        E = 25
                    }
                    if ((E | 0) == 25)
                        if (!L) {
                            L = 0;
                            J = q;
                            M = A;
                            break
                        }
                    L = tb(e, o) | 0;
                    c[t >> 2] = L;
                    if ((c[(c[r >> 2] | 0) + 4 >> 2] | 0) == 2 ? y << 24 >> 24 == 0 | (n | 0) == 3 : 0) {
                        J = tb(e, o) | 0;
                        c[x >> 2] = J;
                        M = A
                    } else {
                        J = q;
                        M = A
                    }
                }
            while (0);
            if (!(y << 24 >> 24)) {
                A = c[r >> 2] | 0;
                q = c[A + 13072 >> 2] | 0;
                y = 1 << q;
                x = c[A + 13148 >> 2] | 0;
                if (((o | 0) == 0 ? (c[v + 31244 >> 2] | 0) != 1 : 0) & (K | 0) == 0 & (L | 0) == 0)
                    if ((c[A + 4 >> 2] | 0) == 2 ? (M | J | 0) != 0 : 0) E = 37;
                    else o = 1;
                else E = 37;
                if ((E | 0) == 37) {
                    o = ub(e, o) | 0;
                    A = c[r >> 2] | 0
                }
                G = c[z >> 2] | 0;
                A = n - (c[A + 13172 >> 2] | 0) | 0;
                z = G + 31244 | 0;
                if ((c[z >> 2] | 0) == 1) {
                    I = 1 << n;
                    Cc(e, f, g, I, I);
                    Ub(e, f, g, n, 0)
                }
                I = (o | 0) != 0;
                K = (K | L | 0) == 0;
                do
                    if (I)
                        if (K) E = 46;
                        else {
                            F = 0;
                            E = 48
                        } else
                if (K) {
                    K = c[r >> 2] | 0;
                    L = c[K + 4 >> 2] | 0;
                    if ((L | 0) == 2) {
                        if (M) {
                            E = 46;
                            break
                        }
                        if (J) {
                            M = 0;
                            E = 46;
                            break
                        }
                    }
                    if (!((c[z >> 2] | 0) != 1 | (L | 0) == 0)) {
                        if (B | (L | 0) == 3) {
                            t = 1 << (c[K + 13172 >> 2] | 0) + A;
                            w = 1 << (c[K + 13184 >> 2] | 0) + A;
                            Cc(e, f, g, t, w);
                            Ub(e, f, g, A, 1);
                            Ub(e, f, g, A, 2);
                            if ((c[(c[r >> 2] | 0) + 4 >> 2] | 0) != 2) break;
                            M = (1 << A) + g | 0;
                            Cc(e, f, M, t, w);
                            Ub(e, f, M, A, 1);
                            Ub(e, f, M, A, 2);
                            break
                        }
                        if ((p | 0) == 3 ? (H = 1 << n + 1, F = 1 << (c[K + 13184 >> 2] | 0) + n, Cc(e, h, j, H, F), Ub(e, h, j, n, 1), Ub(e, h, j, n, 2), (c[(c[r >> 2] | 0) + 4 >> 2] | 0) == 2) : 0) {
                            M = (1 << n) + j | 0;
                            Cc(e, h, M, H, F);
                            Ub(e, h, M, n, 1);
                            Ub(e, h, M, n, 2)
                        }
                    }
                } else {
                    F = 0;
                    E = 48
                }
                while (0);
                if ((E | 0) == 46)
                    if ((c[(c[r >> 2] | 0) + 4 >> 2] | 0) == 2) {
                        F = (M | J | 0) == 0;
                        E = 48
                    } else {
                        F = 1;
                        E = 48
                    }
                a: do
                    if ((E | 0) == 48) {
                        E = e + 204 | 0;
                        do
                            if ((a[(c[E >> 2] | 0) + 22 >> 0] | 0) != 0 ? (D = G + 300 | 0, (a[D >> 0] | 0) == 0) : 0) {
                                M = hb(e) | 0;
                                H = G + 280 | 0;
                                c[H >> 2] = M;
                                if (M) {
                                    M = (ib(e) | 0) == 1;
                                    J = c[H >> 2] | 0;
                                    if (M) {
                                        J = 0 - J | 0;
                                        c[H >> 2] = J
                                    }
                                } else J = 0;
                                a[D >> 0] = 1;
                                M = (c[(c[r >> 2] | 0) + 13192 >> 2] | 0) / 2 | 0;
                                if ((J | 0) < (-26 - M | 0) | (J | 0) > (M + 25 | 0)) {
                                    M = -1094995529;
                                    i = s;
                                    return M | 0
                                } else {
                                    zb(e, k, l, m);
                                    break
                                }
                            }
                        while (0);
                        if ((!((a[e + 2080 >> 0] | 0) == 0 | F) ? (a[G + 31256 >> 0] | 0) == 0 : 0) ? (C = G + 301 | 0, (a[C >> 0] | 0) == 0) : 0) {
                            if (!(jb(e) | 0)) {
                                a[G + 302 >> 0] = 0;
                                a[G + 303 >> 0] = 0
                            } else {
                                k = c[E >> 2] | 0;
                                if (!(a[k + 1633 >> 0] | 0)) l = 0;
                                else {
                                    l = kb(e) | 0;
                                    k = c[E >> 2] | 0
                                }
                                a[G + 302 >> 0] = a[k + l + 1634 >> 0] | 0;
                                a[G + 303 >> 0] = a[(c[E >> 2] | 0) + l + 1639 >> 0] | 0
                            }
                            a[C >> 0] = 1
                        }
                        if ((c[z >> 2] | 0) == 1 & (n | 0) < 4) {
                            k = c[G + 288 >> 2] | 0;
                            if ((k + -6 | 0) >>> 0 < 9) m = 2;
                            else m = (k + -22 | 0) >>> 0 < 9 & 1;
                            k = c[G + 292 >> 2] | 0;
                            if ((k + -6 | 0) >>> 0 < 9) k = 2;
                            else k = (k + -22 | 0) >>> 0 < 9 & 1
                        } else {
                            m = 0;
                            k = 0
                        }
                        l = G + 304 | 0;
                        a[l >> 0] = 0;
                        if (I) xb(e, f, g, n, m, 0);
                        m = c[r >> 2] | 0;
                        C = c[m + 4 >> 2] | 0;
                        if (C) {
                            if (!(B | (C | 0) == 3)) {
                                if ((p | 0) != 3) break;
                                p = 1 << n + 1;
                                A = 1 << (c[m + 13184 >> 2] | 0) + n;
                                l = 0;
                                do {
                                    if ((c[z >> 2] | 0) == 1) {
                                        M = (l << n) + j | 0;
                                        Cc(e, h, M, p, A);
                                        Ub(e, h, M, n, 1)
                                    }
                                    if (c[w + (l << 2) >> 2] | 0) xb(e, h, (l << n) + j | 0, n, k, 1);
                                    l = l + 1 | 0
                                } while ((l | 0) < (((c[(c[r >> 2] | 0) + 4 >> 2] | 0) == 2 ? 2 : 1) | 0));
                                w = 0;
                                while (1) {
                                    if ((c[z >> 2] | 0) == 1) {
                                        M = (w << n) + j | 0;
                                        Cc(e, h, M, p, A);
                                        Ub(e, h, M, n, 2)
                                    }
                                    if (c[t + (w << 2) >> 2] | 0) xb(e, h, (w << n) + j | 0, n, k, 2);
                                    w = w + 1 | 0;
                                    if ((w | 0) >= (((c[(c[r >> 2] | 0) + 4 >> 2] | 0) == 2 ? 2 : 1) | 0)) break a
                                }
                            }
                            j = 1 << (c[m + 13172 >> 2] | 0) + A;
                            h = 1 << (c[m + 13184 >> 2] | 0) + A;
                            do
                                if ((a[(c[E >> 2] | 0) + 1630 >> 0] | 0) == 0 | I ^ 1) a[l >> 0] = 0;
                                else {
                                    if (c[z >> 2] | 0) {
                                        M = (c[G + 296 >> 2] | 0) == 4;
                                        a[l >> 0] = M & 1;
                                        if (!M) break
                                    } else a[l >> 0] = 1;
                                    Tb(e, 0)
                                }
                            while (0);
                            m = e + 160 | 0;
                            C = G + 320 | 0;
                            D = G + 11680 | 0;
                            E = 1 << A << A;
                            B = (E | 0) > 0;
                            p = e + (A + -2 << 2) + 2612 | 0;
                            F = G + 284 | 0;
                            J = 0;
                            do {
                                if ((c[z >> 2] | 0) == 1) {
                                    M = (J << A) + g | 0;
                                    Cc(e, f, M, j, h);
                                    Ub(e, f, M, A, 1)
                                }
                                do
                                    if (!(c[w + (J << 2) >> 2] | 0)) {
                                        if (!(a[l >> 0] | 0)) break;
                                        M = c[m >> 2] | 0;
                                        G = c[M + 36 >> 2] | 0;
                                        H = c[r >> 2] | 0;
                                        I = $(g >> c[H + 13184 >> 2], G) | 0;
                                        I = (c[M + 4 >> 2] | 0) + (I + (f >> c[H + 13172 >> 2] << c[H + 56 >> 2])) | 0;
                                        if (B) {
                                            J = 0;
                                            do {
                                                b[D + (J << 1) >> 1] = ($(b[C + (J << 1) >> 1] | 0, c[F >> 2] | 0) | 0) >>> 3;
                                                J = J + 1 | 0
                                            } while ((J | 0) != (E | 0));
                                            J = E
                                        } else J = 0;
                                        Ka[c[p >> 2] & 7](I, D, G, c[H + 52 >> 2] | 0)
                                    } else xb(e, f, (J << A) + g | 0, A, k, 1);
                                while (0);
                                J = J + 1 | 0
                            } while ((J | 0) < (((c[(c[r >> 2] | 0) + 4 >> 2] | 0) == 2 ? 2 : 1) | 0));
                            if (!(a[l >> 0] | 0)) I = 0;
                            else {
                                Tb(e, 1);
                                I = 0
                            }
                            do {
                                if ((c[z >> 2] | 0) == 1) {
                                    M = (I << A) + g | 0;
                                    Cc(e, f, M, j, h);
                                    Ub(e, f, M, A, 2)
                                }
                                do
                                    if (!(c[t + (I << 2) >> 2] | 0)) {
                                        if (!(a[l >> 0] | 0)) break;
                                        M = c[m >> 2] | 0;
                                        G = c[M + 40 >> 2] | 0;
                                        w = c[r >> 2] | 0;
                                        H = $(g >> c[w + 13188 >> 2], G) | 0;
                                        H = (c[M + 8 >> 2] | 0) + (H + (f >> c[w + 13176 >> 2] << c[w + 56 >> 2])) | 0;
                                        if (B) {
                                            I = 0;
                                            do {
                                                b[D + (I << 1) >> 1] = ($(b[C + (I << 1) >> 1] | 0, c[F >> 2] | 0) | 0) >>> 3;
                                                I = I + 1 | 0
                                            } while ((I | 0) != (E | 0));
                                            I = E
                                        } else I = 0;
                                        Ka[c[p >> 2] & 7](H, D, G, c[w + 52 >> 2] | 0)
                                    } else xb(e, f, (I << A) + g | 0, A, k, 2);
                                while (0);
                                I = I + 1 | 0
                            } while ((I | 0) < (((c[(c[r >> 2] | 0) + 4 >> 2] | 0) == 2 ? 2 : 1) | 0))
                        }
                    }
                while (0);
                if ((o | 0) != 0 ? (u = 1 << n, (u | 0) > 0) : 0) {
                    t = e + 4344 | 0;
                    r = 0;
                    do {
                        w = $(r + g >> q, x) | 0;
                        o = 0;
                        do {
                            a[(c[t >> 2] | 0) + ((o + f >> q) + w) >> 0] = 1;
                            o = o + y | 0
                        } while ((o | 0) < (u | 0));
                        r = r + y | 0
                    } while ((r | 0) < (u | 0))
                }
                if (((a[e + 2061 >> 0] | 0) == 0 ? (Ab(e, f, g, n), (a[(c[e + 204 >> 2] | 0) + 40 >> 0] | 0) != 0) : 0) ? (a[v + 31256 >> 0] | 0) != 0 : 0) Rb(e, f, g, n)
            } else {
                u = n + -1 | 0;
                n = 1 << u;
                v = n + f | 0;
                n = n + g | 0;
                r = o + 1 | 0;
                q = Sb(e, f, g, f, g, k, l, m, u, r, 0, w, t) | 0;
                if ((q | 0) < 0) {
                    M = q;
                    i = s;
                    return M | 0
                }
                q = Sb(e, v, g, f, g, k, l, m, u, r, 1, w, t) | 0;
                if ((q | 0) < 0) {
                    M = q;
                    i = s;
                    return M | 0
                }
                q = Sb(e, f, n, f, g, k, l, m, u, r, 2, w, t) | 0;
                if ((q | 0) < 0) {
                    M = q;
                    i = s;
                    return M | 0
                }
                f = Sb(e, v, n, f, g, k, l, m, u, r, 3, w, t) | 0;
                if ((f | 0) < 0) {
                    M = f;
                    i = s;
                    return M | 0
                }
            }
            M = 0;
            i = s;
            return M | 0
        }

        function Tb(a, b) {
            a = a | 0;
            b = b | 0;
            var d = 0,
                e = 0,
                f = 0;
            d = i;
            e = c[a + 136 >> 2] | 0;
            f = vb(a, b) | 0;
            if (!f) {
                c[e + 284 >> 2] = 0;
                i = d;
                return
            } else {
                c[e + 284 >> 2] = 1 - ((wb(a, b) | 0) << 1) << f + -1;
                i = d;
                return
            }
        }

        function Ub(d, f, g, h, j) {
            d = d | 0;
            f = f | 0;
            g = g | 0;
            h = h | 0;
            j = j | 0;
            var k = 0,
                l = 0,
                m = 0,
                n = 0,
                o = 0,
                p = 0,
                q = 0,
                r = 0,
                s = 0,
                t = 0,
                u = 0,
                v = 0,
                w = 0,
                x = 0,
                y = 0,
                z = 0,
                A = 0,
                B = 0,
                C = 0,
                E = 0,
                F = 0,
                G = 0,
                H = 0,
                I = 0,
                J = 0,
                K = 0,
                L = 0,
                M = 0,
                N = 0,
                O = 0,
                P = 0,
                Q = 0,
                R = 0,
                S = 0,
                T = 0,
                U = 0,
                V = 0,
                W = 0,
                X = 0,
                Y = 0,
                Z = 0,
                _ = 0,
                aa = 0,
                ba = 0,
                ca = 0,
                da = 0,
                ea = 0,
                fa = 0,
                ga = 0,
                ha = 0,
                ia = 0,
                ja = 0,
                ka = 0,
                la = 0,
                ma = 0,
                na = 0,
                oa = 0,
                pa = 0,
                qa = 0,
                ra = 0;
            l = i;
            i = i + 528 | 0;
            v = l + 390 | 0;
            A = l + 260 | 0;
            y = l + 130 | 0;
            x = l;
            t = c[d + 136 >> 2] | 0;
            s = c[d + 200 >> 2] | 0;
            q = c[s + 52 >> 2] | 0;
            V = c[s + (j << 2) + 13168 >> 2] | 0;
            U = c[s + (j << 2) + 13180 >> 2] | 0;
            k = 1 << h;
            ma = k << V;
            X = c[s + 13072 >> 2] | 0;
            oa = k << U;
            _ = c[s + 13164 >> 2] | 0;
            W = f >> X & _;
            ia = g >> X & _;
            Y = _ + 2 | 0;
            aa = ($(ia, Y) | 0) + W | 0;
            ba = c[d + 204 >> 2] | 0;
            ca = c[ba + 1684 >> 2] | 0;
            aa = c[ca + (aa << 2) >> 2] | 0;
            n = c[d + 160 >> 2] | 0;
            d = (c[n + (j << 2) + 32 >> 2] | 0) >>> 1;
            n = c[n + (j << 2) >> 2] | 0;
            m = ($(d, g >> U) | 0) + (f >> V) | 0;
            o = n + (m << 1) | 0;
            p = (j | 0) == 0;
            r = c[(p ? t + 288 | 0 : t + 292 | 0) >> 2] | 0;
            w = v + 2 | 0;
            B = y + 2 | 0;
            z = A + 2 | 0;
            u = x + 2 | 0;
            if (!(c[t + 31288 >> 2] | 0)) na = 0;
            else na = (aa | 0) > (c[ca + (W + -1 + ($(_ & ia + (oa >> X), Y) | 0) << 2) >> 2] | 0);
            la = na & 1;
            da = c[t + 31292 >> 2] | 0;
            M = c[t + 31300 >> 2] | 0;
            Z = c[t + 31296 >> 2] | 0;
            if (!(c[t + 31304 >> 2] | 0)) ja = 0;
            else ja = (aa | 0) > (c[ca + (($(Y, ia + -1 | 0) | 0) + (_ & W + (ma >> X)) << 2) >> 2] | 0);
            W = ja & 1;
            ca = (oa << 1) + g | 0;
            _ = s + 13124 | 0;
            ia = c[_ >> 2] | 0;
            X = oa + g | 0;
            ca = ((ca | 0) > (ia | 0) ? ia : ca) - X >> U;
            ia = (ma << 1) + f | 0;
            aa = s + 13120 | 0;
            ra = c[aa >> 2] | 0;
            Y = ma + f | 0;
            ia = ((ia | 0) > (ra | 0) ? ra : ia) - Y >> V;
            ba = ba + 20 | 0;
            if ((a[ba >> 0] | 0) == 1) {
                ka = c[s + 13084 >> 2] | 0;
                pa = oa >> ka;
                ma = ma >> ka;
                qa = (1 << ka) + -1 | 0;
                oa = qa & g;
                ma = ((ma | 0) == 0 & 1) + ma | 0;
                qa = (qa & f | 0) != 0;
                if (!(qa | na ^ 1)) {
                    na = (c[s + 13160 >> 2] | 0) - (X >> ka) | 0;
                    na = (pa | 0) > (na | 0) ? na : pa;
                    if ((na | 0) > 0) {
                        la = 0;
                        ra = 0;
                        do {
                            la = la | 1;
                            ra = ra + 2 | 0
                        } while ((ra | 0) < (na | 0))
                    } else la = 0
                }
                if (!((da | 0) != 1 | qa)) {
                    ra = (c[s + 13160 >> 2] | 0) - (g >> ka) | 0;
                    pa = (pa | 0) > (ra | 0) ? ra : pa;
                    if ((pa | 0) > 0) {
                        da = 0;
                        na = 0;
                        do {
                            da = da | 1;
                            na = na + 2 | 0
                        } while ((na | 0) < (pa | 0))
                    } else da = 0
                }
                na = (oa | 0) != 0;
                if (!((Z | 0) != 1 | na)) {
                    oa = (c[s + 13156 >> 2] | 0) - (f >> ka) | 0;
                    oa = (ma | 0) > (oa | 0) ? oa : ma;
                    if ((oa | 0) > 0) {
                        Z = 0;
                        pa = 0;
                        do {
                            Z = Z | 1;
                            pa = pa + 2 | 0
                        } while ((pa | 0) < (oa | 0))
                    } else Z = 0
                }
                if (!(na | ja ^ 1)) {
                    ka = (c[s + 13156 >> 2] | 0) - (Y >> ka) | 0;
                    ka = (ma | 0) > (ka | 0) ? ka : ma;
                    if ((ka | 0) > 0) {
                        W = 0;
                        ja = 0;
                        do {
                            W = W | 1;
                            ja = ja + 2 | 0
                        } while ((ja | 0) < (ka | 0))
                    } else W = 0
                }
                ka = w + 0 | 0;
                ja = ka + 128 | 0;
                do {
                    b[ka >> 1] = 32896;
                    ka = ka + 2 | 0
                } while ((ka | 0) < (ja | 0));
                ka = B + 0 | 0;
                ja = ka + 128 | 0;
                do {
                    b[ka >> 1] = 32896;
                    ka = ka + 2 | 0
                } while ((ka | 0) < (ja | 0));
                b[y >> 1] = 128;
                ma = W
            } else ma = W;
            ka = (M | 0) != 0;
            if (ka) {
                ra = b[n + (m + ~d << 1) >> 1] | 0;
                b[v >> 1] = ra;
                b[y >> 1] = ra
            }
            ja = (Z | 0) != 0;
            if (ja) fe(B | 0, n + (m - d << 1) | 0, k << 1 | 0) | 0;
            W = (ma | 0) != 0;
            if (W ? (ha = k + 1 | 0, fe(y + (ha << 1) | 0, n + (k - d + m << 1) | 0, k << 1 | 0) | 0, fa = ke(e[n + (k + -1 - d + m + ia << 1) >> 1] | 0, 0, 65537, 65537) | 0, ga = D, ea = k - ia | 0, (ea | 0) > 0) : 0) {
                ia = ia + ha | 0;
                ha = 0;
                do {
                    ra = y + (ia + ha << 1) | 0;
                    qa = ra;
                    b[qa >> 1] = fa;
                    b[qa + 2 >> 1] = fa >>> 16;
                    ra = ra + 4 | 0;
                    b[ra >> 1] = ga;
                    b[ra + 2 >> 1] = ga >>> 16;
                    ha = ha + 4 | 0
                } while ((ha | 0) < (ea | 0))
            }
            ea = (da | 0) != 0;
            if (ea & (k | 0) > 0) {
                fa = m + -1 | 0;
                ga = 0;
                do {
                    ra = ga;
                    ga = ga + 1 | 0;
                    b[v + (ga << 1) >> 1] = b[n + (fa + ($(ra, d) | 0) << 1) >> 1] | 0
                } while ((ga | 0) != (k | 0))
            }
            fa = (la | 0) != 0;
            if (fa) {
                ia = ca + k | 0;
                ha = m + -1 | 0;
                if ((ca | 0) > 0) {
                    ga = k;
                    do {
                        ra = ga;
                        ga = ga + 1 | 0;
                        b[v + (ga << 1) >> 1] = b[n + (ha + ($(ra, d) | 0) << 1) >> 1] | 0
                    } while ((ga | 0) < (ia | 0))
                }
                ia = ke(e[n + (ha + ($(ia + -1 | 0, d) | 0) << 1) >> 1] | 0, 0, 65537, 65537) | 0;
                ha = D;
                ga = k - ca | 0;
                if ((ga | 0) > 0) {
                    ca = k + 1 + ca | 0;
                    na = 0;
                    do {
                        ra = v + (ca + na << 1) | 0;
                        qa = ra;
                        b[qa >> 1] = ia;
                        b[qa + 2 >> 1] = ia >>> 16;
                        ra = ra + 4 | 0;
                        b[ra >> 1] = ha;
                        b[ra + 2 >> 1] = ha >>> 16;
                        na = na + 4 | 0
                    } while ((na | 0) < (ga | 0))
                }
            }
            do
                if ((a[ba >> 0] | 0) == 1 ? (ra = la | da, S = (ra | 0) == 0, ra = ra | M, T = (ra | 0) == 0, (Z | ma | ra | 0) != 0) : 0) {
                    ba = k << 1;
                    ca = c[aa >> 2] | 0;
                    if (((ba << V) + f | 0) < (ca | 0)) aa = ba;
                    else aa = ca - f >> V;
                    _ = c[_ >> 2] | 0;
                    if (((ba << U) + g | 0) >= (_ | 0)) ba = _ - g >> U;
                    if (!W)
                        if ((Y | 0) < (ca | 0)) V = k;
                        else V = ca - f >> V;
                    else V = aa;
                    if (!fa)
                        if ((X | 0) < (_ | 0)) U = k;
                        else U = _ - g >> U;
                    else U = ba;
                    X = b[y >> 1] | 0;
                    if (T) b[v >> 1] = X;
                    b[v >> 1] = X;
                    if (!S) {
                        S = 0;
                        while (1)
                            if ((S | 0) < (U | 0)) S = S + 4 | 0;
                            else break
                    }
                    if (!ea ? (R = ke(X & 65535 | 0, 0, 65537, 65537) | 0, Q = D, (k | 0) > 0) : 0) {
                        S = 0;
                        do {
                            ra = v + ((S | 1) << 1) | 0;
                            qa = ra;
                            b[qa >> 1] = R;
                            b[qa + 2 >> 1] = R >>> 16;
                            ra = ra + 4 | 0;
                            b[ra >> 1] = Q;
                            b[ra + 2 >> 1] = Q >>> 16;
                            S = S + 4 | 0
                        } while ((S | 0) < (k | 0))
                    }
                    do
                        if (!fa) {
                            Q = ke(e[v + (k << 1) >> 1] | 0, 0, 65537, 65537) | 0;
                            S = D;
                            if ((k | 0) <= 0) break;
                            T = k + 1 | 0;
                            R = 0;
                            do {
                                ra = v + (T + R << 1) | 0;
                                qa = ra;
                                b[qa >> 1] = Q;
                                b[qa + 2 >> 1] = Q >>> 16;
                                ra = ra + 4 | 0;
                                b[ra >> 1] = S;
                                b[ra + 2 >> 1] = S >>> 16;
                                R = R + 4 | 0
                            } while ((R | 0) < (k | 0))
                        }
                    while (0);
                    g = (g | 0) == 0;
                    if ((f | 0) == 0 & (U | 0) > 0) {
                        f = 0;
                        do {
                            ra = v + ((f | 1) << 1) | 0;
                            qa = ra;
                            b[qa >> 1] = 0;
                            b[qa + 2 >> 1] = 0 >>> 16;
                            ra = ra + 4 | 0;
                            b[ra >> 1] = 0;
                            b[ra + 2 >> 1] = 0 >>> 16;
                            f = f + 4 | 0
                        } while ((f | 0) < (U | 0))
                    }
                    b[y >> 1] = b[v >> 1] | 0;
                    if (g) break;
                    else f = 0;
                    while (1)
                        if ((f | 0) < (V | 0)) f = f + 4 | 0;
                        else break
                }
            while (0);
            a: do
                if (!fa) {
                    if (ea) {
                        P = ke(e[v + (k << 1) >> 1] | 0, 0, 65537, 65537) | 0;
                        f = D;
                        if ((k | 0) <= 0) {
                            P = 84;
                            break
                        }
                        g = k + 1 | 0;
                        Q = 0;
                        while (1) {
                            ra = v + (g + Q << 1) | 0;
                            qa = ra;
                            b[qa >> 1] = P;
                            b[qa + 2 >> 1] = P >>> 16;
                            ra = ra + 4 | 0;
                            b[ra >> 1] = f;
                            b[ra + 2 >> 1] = f >>> 16;
                            Q = Q + 4 | 0;
                            if ((Q | 0) >= (k | 0)) {
                                P = 84;
                                break a
                            }
                        }
                    }
                    if (ka) {
                        f = ke(e[v >> 1] | 0, 0, 65537, 65537) | 0;
                        P = D;
                        O = k << 1;
                        if ((k | 0) > 0) N = 0;
                        else {
                            P = 87;
                            break
                        }
                        while (1) {
                            ra = v + ((N | 1) << 1) | 0;
                            qa = ra;
                            b[qa >> 1] = f;
                            b[qa + 2 >> 1] = f >>> 16;
                            ra = ra + 4 | 0;
                            b[ra >> 1] = P;
                            b[ra + 2 >> 1] = P >>> 16;
                            N = N + 4 | 0;
                            if ((N | 0) >= (O | 0)) {
                                P = 87;
                                break a
                            }
                        }
                    }
                    if (ja) {
                        N = b[B >> 1] | 0;
                        b[v >> 1] = N;
                        N = ke(N & 65535 | 0, 0, 65537, 65537) | 0;
                        O = D;
                        M = k << 1;
                        if ((k | 0) > 0) P = 0;
                        else {
                            P = 89;
                            break
                        }
                        while (1) {
                            ra = v + ((P | 1) << 1) | 0;
                            qa = ra;
                            b[qa >> 1] = N;
                            b[qa + 2 >> 1] = N >>> 16;
                            ra = ra + 4 | 0;
                            b[ra >> 1] = O;
                            b[ra + 2 >> 1] = O >>> 16;
                            P = P + 4 | 0;
                            if ((P | 0) >= (M | 0)) {
                                P = 89;
                                break a
                            }
                        }
                    }
                    if (!W) {
                        g = 1 << q + -1;
                        b[v >> 1] = g;
                        R = ke(g & 65535 | 0, 0, 65537, 65537) | 0;
                        Q = D;
                        P = k << 1;
                        f = (k | 0) > 0;
                        if (f) S = 0;
                        else {
                            P = 84;
                            break
                        }
                        do {
                            ra = y + ((S | 1) << 1) | 0;
                            qa = ra;
                            b[qa >> 1] = R;
                            b[qa + 2 >> 1] = R >>> 16;
                            ra = ra + 4 | 0;
                            b[ra >> 1] = Q;
                            b[ra + 2 >> 1] = Q >>> 16;
                            S = S + 4 | 0
                        } while ((S | 0) < (P | 0));
                        g = ke(g & 65535 | 0, 0, 65537, 65537) | 0;
                        Q = D;
                        if (f) f = 0;
                        else {
                            P = 84;
                            break
                        }
                        while (1) {
                            ra = v + ((f | 1) << 1) | 0;
                            qa = ra;
                            b[qa >> 1] = g;
                            b[qa + 2 >> 1] = g >>> 16;
                            ra = ra + 4 | 0;
                            b[ra >> 1] = Q;
                            b[ra + 2 >> 1] = Q >>> 16;
                            f = f + 4 | 0;
                            if ((f | 0) >= (P | 0)) {
                                P = 84;
                                break a
                            }
                        }
                    }
                    M = y + (k + 1 << 1) | 0;
                    O = b[M >> 1] | 0;
                    N = ke(O & 65535 | 0, 0, 65537, 65537) | 0;
                    L = D;
                    K = (k | 0) > 0;
                    if (K) O = 0;
                    else {
                        b[v >> 1] = O;
                        break
                    }
                    do {
                        ra = y + ((O | 1) << 1) | 0;
                        qa = ra;
                        b[qa >> 1] = N;
                        b[qa + 2 >> 1] = N >>> 16;
                        ra = ra + 4 | 0;
                        b[ra >> 1] = L;
                        b[ra + 2 >> 1] = L >>> 16;
                        O = O + 4 | 0
                    } while ((O | 0) < (k | 0));
                    M = b[M >> 1] | 0;
                    b[v >> 1] = M;
                    M = ke(M & 65535 | 0, 0, 65537, 65537) | 0;
                    L = D;
                    N = k << 1;
                    if (K) {
                        K = 0;
                        do {
                            ra = v + ((K | 1) << 1) | 0;
                            qa = ra;
                            b[qa >> 1] = M;
                            b[qa + 2 >> 1] = M >>> 16;
                            ra = ra + 4 | 0;
                            b[ra >> 1] = L;
                            b[ra + 2 >> 1] = L >>> 16;
                            K = K + 4 | 0
                        } while ((K | 0) < (N | 0));
                        P = 92
                    } else P = 92
                } else P = 84;
            while (0);
            if ((P | 0) == 84)
                if ((da | 0) == 0 ? (N = ke(e[v + (k + 1 << 1) >> 1] | 0, 0, 65537, 65537) | 0, O = D, (k | 0) > 0) : 0) {
                    P = 0;
                    do {
                        ra = v + ((P | 1) << 1) | 0;
                        qa = ra;
                        b[qa >> 1] = N;
                        b[qa + 2 >> 1] = N >>> 16;
                        ra = ra + 4 | 0;
                        b[ra >> 1] = O;
                        b[ra + 2 >> 1] = O >>> 16;
                        P = P + 4 | 0
                    } while ((P | 0) < (k | 0));
                    P = 87
                } else P = 87;
            if ((P | 0) == 87)
                if (!M) {
                    b[v >> 1] = b[w >> 1] | 0;
                    P = 89
                } else P = 89;
            if ((P | 0) == 89)
                if ((Z | 0) == 0 ? (K = ke(e[v >> 1] | 0, 0, 65537, 65537) | 0, L = D, (k | 0) > 0) : 0) {
                    M = 0;
                    do {
                        ra = y + ((M | 1) << 1) | 0;
                        qa = ra;
                        b[qa >> 1] = K;
                        b[qa + 2 >> 1] = K >>> 16;
                        ra = ra + 4 | 0;
                        b[ra >> 1] = L;
                        b[ra + 2 >> 1] = L >>> 16;
                        M = M + 4 | 0
                    } while ((M | 0) < (k | 0));
                    P = 92
                } else P = 92;
            if (((P | 0) == 92 ? !W : 0) ? (J = ke(e[y + (k << 1) >> 1] | 0, 0, 65537, 65537) | 0, I = D, (k | 0) > 0) : 0) {
                K = k + 1 | 0;
                L = 0;
                do {
                    ra = y + (K + L << 1) | 0;
                    qa = ra;
                    b[qa >> 1] = J;
                    b[qa + 2 >> 1] = J >>> 16;
                    ra = ra + 4 | 0;
                    b[ra >> 1] = I;
                    b[ra + 2 >> 1] = I >>> 16;
                    L = L + 4 | 0
                } while ((L | 0) < (k | 0))
            }
            I = b[v >> 1] | 0;
            b[y >> 1] = I;
            b: do
                if (!(c[s + 13112 >> 2] | 0)) {
                    if (p) {
                        if ((r | 0) == 1 | (k | 0) == 4) {
                            u = B;
                            break
                        }
                    } else if (((r | 0) == 1 ? 1 : (c[s + 4 >> 2] | 0) != 3) | (k | 0) == 4) {
                        u = B;
                        break
                    }
                    ra = r + -26 | 0;
                    ra = (ra | 0) > -1 ? ra : 26 - r | 0;
                    qa = r + -10 | 0;
                    qa = (qa | 0) > -1 ? qa : 10 - r | 0;
                    if ((((ra | 0) > (qa | 0) ? qa : ra) | 0) > (c[1576 + (h + -3 << 2) >> 2] | 0)) {
                        J = 1 << q + -5;
                        if ((p & (a[s + 13061 >> 0] | 0) != 0 & (h | 0) == 5 ? (G = I & 65535, H = b[y + 128 >> 1] | 0, F = H & 65535, ra = F + G - (e[y + 64 >> 1] << 1) | 0, (((ra | 0) > -1 ? ra : 0 - ra | 0) | 0) < (J | 0)) : 0) ? (C = v + 128 | 0, E = b[C >> 1] | 0, ra = (E & 65535) + G - (e[v + 64 >> 1] << 1) | 0, (((ra | 0) > -1 ? ra : 0 - ra | 0) | 0) < (J | 0)) : 0) {
                            b[x >> 1] = I;
                            b[x + 128 >> 1] = H;
                            y = 0;
                            do {
                                ra = y;
                                y = y + 1 | 0;
                                b[x + (y << 1) >> 1] = (($(G, 63 - ra | 0) | 0) + 32 + ($(F, y) | 0) | 0) >>> 6
                            } while ((y | 0) != 63);
                            y = 0;
                            while (1) {
                                x = y + 1 | 0;
                                b[v + (x << 1) >> 1] = (($(I & 65535, 63 - y | 0) | 0) + 32 + ($(E & 65535, x) | 0) | 0) >>> 6;
                                if ((x | 0) == 63) break b;
                                I = b[v >> 1] | 0;
                                E = b[C >> 1] | 0;
                                y = x
                            }
                        }
                        C = k << 1;
                        H = b[v + (C << 1) >> 1] | 0;
                        b[A + (C << 1) >> 1] = H;
                        F = b[y + (C << 1) >> 1] | 0;
                        b[x + (C << 1) >> 1] = F;
                        C = C + -2 | 0;
                        E = (C | 0) > -1;
                        if (E) {
                            G = C;
                            while (1) {
                                ra = G + 1 | 0;
                                qa = H;
                                H = b[v + (ra << 1) >> 1] | 0;
                                b[A + (ra << 1) >> 1] = ((qa & 65535) + 2 + ((H & 65535) << 1) + (e[v + (G << 1) >> 1] | 0) | 0) >>> 2;
                                if ((G | 0) <= 0) break;
                                else G = G + -1 | 0
                            }
                        }
                        ra = ((e[w >> 1] | 0) + 2 + ((I & 65535) << 1) + (e[B >> 1] | 0) | 0) >>> 2 & 65535;
                        b[A >> 1] = ra;
                        b[x >> 1] = ra;
                        if (E)
                            while (1) {
                                ra = C + 1 | 0;
                                qa = F;
                                F = b[y + (ra << 1) >> 1] | 0;
                                b[x + (ra << 1) >> 1] = ((qa & 65535) + 2 + ((F & 65535) << 1) + (e[y + (C << 1) >> 1] | 0) | 0) >>> 2;
                                if ((C | 0) <= 0) {
                                    w = z;
                                    break
                                } else C = C + -1 | 0
                            } else w = z
                    } else u = B
                } else u = B;
            while (0);
            if (!r) {
                Vb(o, u, w, d, h);
                i = l;
                return
            } else if ((r | 0) == 1) {
                if ((k | 0) > 0) {
                    j = k;
                    q = 0;
                    do {
                        j = (e[w + (q << 1) >> 1] | 0) + j + (e[u + (q << 1) >> 1] | 0) | 0;
                        q = q + 1 | 0
                    } while ((q | 0) != (k | 0));
                    r = j >> h + 1;
                    s = ke(r | 0, ((r | 0) < 0) << 31 >> 31 | 0, 65537, 65537) | 0;
                    t = D;
                    q = 0;
                    do {
                        j = ($(q, d) | 0) + m | 0;
                        h = 0;
                        do {
                            ra = n + (j + h << 1) | 0;
                            qa = ra;
                            a[qa >> 0] = s;
                            a[qa + 1 >> 0] = s >> 8;
                            a[qa + 2 >> 0] = s >> 16;
                            a[qa + 3 >> 0] = s >> 24;
                            ra = ra + 4 | 0;
                            a[ra >> 0] = t;
                            a[ra + 1 >> 0] = t >> 8;
                            a[ra + 2 >> 0] = t >> 16;
                            a[ra + 3 >> 0] = t >> 24;
                            h = h + 4 | 0
                        } while ((h | 0) < (k | 0));
                        q = q + 1 | 0
                    } while ((q | 0) != (k | 0))
                } else r = k >> h + 1;
                if (!(p & (k | 0) < 32)) {
                    i = l;
                    return
                }
                b[o >> 1] = ((r << 1) + 2 + (e[w >> 1] | 0) + (e[u >> 1] | 0) | 0) >>> 2;
                if ((k | 0) <= 1) {
                    i = l;
                    return
                }
                o = (r * 3 | 0) + 2 | 0;
                p = 1;
                do {
                    b[n + (p + m << 1) >> 1] = ((e[u + (p << 1) >> 1] | 0) + o | 0) >>> 2;
                    p = p + 1 | 0
                } while ((p | 0) != (k | 0));
                p = 1;
                do {
                    b[n + (($(p, d) | 0) + m << 1) >> 1] = ((e[w + (p << 1) >> 1] | 0) + o | 0) >>> 2;
                    p = p + 1 | 0
                } while ((p | 0) != (k | 0));
                i = l;
                return
            } else {
                if (!(c[s + 13104 >> 2] | 0)) m = 0;
                else m = (a[t + 31256 >> 0] | 0) != 0;
                Wb(o, u, w, d, j, r, k, m & 1, q);
                i = l;
                return
            }
        }

        function Vb(a, c, d, f, g) {
            a = a | 0;
            c = c | 0;
            d = d | 0;
            f = f | 0;
            g = g | 0;
            var h = 0,
                j = 0,
                k = 0,
                l = 0,
                m = 0,
                n = 0,
                o = 0,
                p = 0,
                q = 0,
                r = 0,
                s = 0,
                t = 0,
                u = 0,
                v = 0;
            m = i;
            j = 1 << g;
            if ((j | 0) <= 0) {
                i = m;
                return
            }
            l = j + -1 | 0;
            h = c + (j << 1) | 0;
            k = d + (j << 1) | 0;
            g = g + 1 | 0;
            n = 0;
            do {
                o = d + (n << 1) | 0;
                p = l - n | 0;
                q = $(n, f) | 0;
                n = n + 1 | 0;
                r = 0;
                do {
                    v = $(e[o >> 1] | 0, l - r | 0) | 0;
                    s = r;
                    r = r + 1 | 0;
                    u = $(e[h >> 1] | 0, r) | 0;
                    t = $(e[c + (s << 1) >> 1] | 0, p) | 0;
                    b[a + (s + q << 1) >> 1] = v + j + u + t + ($(e[k >> 1] | 0, n) | 0) >> g
                } while ((r | 0) != (j | 0))
            } while ((n | 0) != (j | 0));
            i = m;
            return
        }

        function Wb(c, f, g, h, j, k, l, m, n) {
            c = c | 0;
            f = f | 0;
            g = g | 0;
            h = h | 0;
            j = j | 0;
            k = k | 0;
            l = l | 0;
            m = m | 0;
            n = n | 0;
            var o = 0,
                p = 0,
                q = 0,
                r = 0,
                s = 0,
                t = 0,
                u = 0,
                v = 0,
                w = 0,
                x = 0,
                y = 0,
                z = 0,
                A = 0;
            o = i;
            i = i + 208 | 0;
            r = o;
            p = a[1592 + (k + -2) >> 0] | 0;
            q = r + (l << 1) | 0;
            s = ($(p, l) | 0) >> 5;
            if ((k | 0) > 17) {
                u = f + -2 | 0;
                t = k + -11 | 0;
                if (t >>> 0 < 15 & (s | 0) < -1) {
                    if ((l | 0) >= 0) {
                        u = 0;
                        do {
                            w = f + (u + -1 << 1) | 0;
                            y = w;
                            y = d[y >> 0] | d[y + 1 >> 0] << 8 | d[y + 2 >> 0] << 16 | d[y + 3 >> 0] << 24;
                            w = w + 4 | 0;
                            w = d[w >> 0] | d[w + 1 >> 0] << 8 | d[w + 2 >> 0] << 16 | d[w + 3 >> 0] << 24;
                            x = r + (u + l << 1) | 0;
                            v = x;
                            b[v >> 1] = y;
                            b[v + 2 >> 1] = y >>> 16;
                            x = x + 4 | 0;
                            b[x >> 1] = w;
                            b[x + 2 >> 1] = w >>> 16;
                            u = u + 4 | 0
                        } while ((u | 0) <= (l | 0))
                    }
                    if ((s | 0) < 0) {
                        t = b[1632 + (t << 1) >> 1] | 0;
                        do {
                            b[r + (s + l << 1) >> 1] = b[g + ((($(t, s) | 0) + 128 >> 8) + -1 << 1) >> 1] | 0;
                            s = s + 1 | 0
                        } while ((s | 0) != 0)
                    }
                } else q = u;
                r = (l | 0) > 0;
                if (r) {
                    s = 0;
                    do {
                        w = s;
                        s = s + 1 | 0;
                        v = $(s, p) | 0;
                        t = v >> 5;
                        v = v & 31;
                        if (!v) {
                            t = t + 1 | 0;
                            v = $(w, h) | 0;
                            u = 0;
                            do {
                                x = q + (t + u << 1) | 0;
                                z = x;
                                z = d[z >> 0] | d[z + 1 >> 0] << 8 | d[z + 2 >> 0] << 16 | d[z + 3 >> 0] << 24;
                                x = x + 4 | 0;
                                x = d[x >> 0] | d[x + 1 >> 0] << 8 | d[x + 2 >> 0] << 16 | d[x + 3 >> 0] << 24;
                                y = c + (u + v << 1) | 0;
                                w = y;
                                a[w >> 0] = z;
                                a[w + 1 >> 0] = z >> 8;
                                a[w + 2 >> 0] = z >> 16;
                                a[w + 3 >> 0] = z >> 24;
                                y = y + 4 | 0;
                                a[y >> 0] = x;
                                a[y + 1 >> 0] = x >> 8;
                                a[y + 2 >> 0] = x >> 16;
                                a[y + 3 >> 0] = x >> 24;
                                u = u + 4 | 0
                            } while ((u | 0) < (l | 0))
                        } else {
                            u = 32 - v | 0;
                            w = $(w, h) | 0;
                            x = 0;
                            do {
                                z = x + t | 0;
                                y = $(e[q + (z + 1 << 1) >> 1] | 0, u) | 0;
                                b[c + (x + w << 1) >> 1] = (y + 16 + ($(e[q + (z + 2 << 1) >> 1] | 0, v) | 0) | 0) >>> 5;
                                z = x | 1;
                                y = z + t | 0;
                                A = $(e[q + (y + 1 << 1) >> 1] | 0, u) | 0;
                                b[c + (z + w << 1) >> 1] = (A + 16 + ($(e[q + (y + 2 << 1) >> 1] | 0, v) | 0) | 0) >>> 5;
                                z = x | 2;
                                y = z + t | 0;
                                A = $(e[q + (y + 1 << 1) >> 1] | 0, u) | 0;
                                b[c + (z + w << 1) >> 1] = (A + 16 + ($(e[q + (y + 2 << 1) >> 1] | 0, v) | 0) | 0) >>> 5;
                                z = x | 3;
                                y = z + t | 0;
                                A = $(e[q + (y + 1 << 1) >> 1] | 0, u) | 0;
                                b[c + (z + w << 1) >> 1] = (A + 16 + ($(e[q + (y + 2 << 1) >> 1] | 0, v) | 0) | 0) >>> 5;
                                x = x + 4 | 0
                            } while ((x | 0) < (l | 0))
                        }
                    } while ((s | 0) != (l | 0))
                }
                if (!((k | 0) == 26 & (j | 0) == 0 & (l | 0) < 32 & (m | 0) == 0 & r)) {
                    i = o;
                    return
                }
                j = g + -2 | 0;
                k = 1 << n;
                m = 0 - k | 0;
                k = k + -1 | 0;
                n = 0;
                do {
                    p = ((e[g + (n << 1) >> 1] | 0) - (e[j >> 1] | 0) >> 1) + (e[f >> 1] | 0) | 0;
                    if (p & m) p = 0 - p >> 31 & k;
                    b[c + (($(n, h) | 0) << 1) >> 1] = p;
                    n = n + 1 | 0
                } while ((n | 0) != (l | 0));
                i = o;
                return
            }
            u = g + -2 | 0;
            t = k + -11 | 0;
            if (t >>> 0 < 15 & (s | 0) < -1) {
                if ((l | 0) >= 0) {
                    u = 0;
                    do {
                        z = g + (u + -1 << 1) | 0;
                        x = z;
                        x = d[x >> 0] | d[x + 1 >> 0] << 8 | d[x + 2 >> 0] << 16 | d[x + 3 >> 0] << 24;
                        z = z + 4 | 0;
                        z = d[z >> 0] | d[z + 1 >> 0] << 8 | d[z + 2 >> 0] << 16 | d[z + 3 >> 0] << 24;
                        A = r + (u + l << 1) | 0;
                        y = A;
                        b[y >> 1] = x;
                        b[y + 2 >> 1] = x >>> 16;
                        A = A + 4 | 0;
                        b[A >> 1] = z;
                        b[A + 2 >> 1] = z >>> 16;
                        u = u + 4 | 0
                    } while ((u | 0) <= (l | 0))
                }
                if ((s | 0) < 0) {
                    t = b[1632 + (t << 1) >> 1] | 0;
                    do {
                        b[r + (s + l << 1) >> 1] = b[f + ((($(t, s) | 0) + 128 >> 8) + -1 << 1) >> 1] | 0;
                        s = s + 1 | 0
                    } while ((s | 0) != 0)
                }
            } else q = u;
            r = (l | 0) > 0;
            if (r) {
                t = 0;
                do {
                    s = t;
                    t = t + 1 | 0;
                    w = $(t, p) | 0;
                    x = w >> 5;
                    w = w & 31;
                    if (!w) {
                        v = x + 1 | 0;
                        u = 0;
                        do {
                            b[c + (($(u, h) | 0) + s << 1) >> 1] = b[q + (v + u << 1) >> 1] | 0;
                            u = u + 1 | 0
                        } while ((u | 0) != (l | 0))
                    } else {
                        v = 32 - w | 0;
                        u = 0;
                        do {
                            A = u + x | 0;
                            z = $(e[q + (A + 1 << 1) >> 1] | 0, v) | 0;
                            b[c + (($(u, h) | 0) + s << 1) >> 1] = (z + 16 + ($(e[q + (A + 2 << 1) >> 1] | 0, w) | 0) | 0) >>> 5;
                            u = u + 1 | 0
                        } while ((u | 0) != (l | 0))
                    }
                } while ((t | 0) != (l | 0))
            }
            if (!((k | 0) == 10 & (j | 0) == 0 & (l | 0) < 32 & (m | 0) == 0 & r)) {
                i = o;
                return
            }
            h = f + -2 | 0;
            j = 1 << n;
            n = 0 - j | 0;
            j = j + -1 | 0;
            k = 0;
            do {
                m = ((e[f + (k << 1) >> 1] | 0) - (e[h >> 1] | 0) >> 1) + (e[g >> 1] | 0) | 0;
                if (m & n) m = 0 - m >> 31 & j;
                b[c + (k << 1) >> 1] = m;
                m = k | 1;
                p = ((e[f + (m << 1) >> 1] | 0) - (e[h >> 1] | 0) >> 1) + (e[g >> 1] | 0) | 0;
                if (p & n) p = 0 - p >> 31 & j;
                b[c + (m << 1) >> 1] = p;
                m = k | 2;
                p = ((e[f + (m << 1) >> 1] | 0) - (e[h >> 1] | 0) >> 1) + (e[g >> 1] | 0) | 0;
                if (p & n) p = 0 - p >> 31 & j;
                b[c + (m << 1) >> 1] = p;
                m = k | 3;
                p = ((e[f + (m << 1) >> 1] | 0) - (e[h >> 1] | 0) >> 1) + (e[g >> 1] | 0) | 0;
                if (p & n) p = 0 - p >> 31 & j;
                b[c + (m << 1) >> 1] = p;
                k = k + 4 | 0
            } while ((k | 0) < (l | 0));
            i = o;
            return
        }

        function Xb(b, e, f) {
            b = b | 0;
            e = e | 0;
            f = f | 0;
            var g = 0,
                h = 0;
            g = i;
            h = c[e >> 2] | 0;
            if (!h) {
                i = g;
                return
            }
            if (!(c[h + 304 >> 2] | 0)) {
                i = g;
                return
            }
            h = e + 46 | 0;
            f = (d[h >> 0] | 0) & (f ^ 255) & 255;
            a[h >> 0] = f;
            if (f << 24 >> 24) {
                i = g;
                return
            }
            Uc(c[b + 4 >> 2] | 0, e + 4 | 0);
            c[e + 24 >> 2] = 0;
            i = g;
            return
        }

        function Yb(a) {
            a = a | 0;
            var b = 0;
            b = i;
            Xb(a, a + 2524 | 0, 6);
            i = b;
            return
        }

        function Zb(a) {
            a = a | 0;
            var b = 0;
            b = i;
            Xb(a, a + 2524 | 0, -1);
            i = b;
            return
        }

        function _b(d, e, f) {
            d = d | 0;
            e = e | 0;
            f = f | 0;
            var g = 0,
                h = 0,
                j = 0,
                k = 0,
                l = 0,
                m = 0;
            g = i;
            h = d + 4364 | 0;
            if (((c[(c[d + 2524 >> 2] | 0) + 304 >> 2] | 0) != 0 ? (b[d + 2568 >> 1] | 0) == (b[h >> 1] | 0) : 0) ? (c[d + 2544 >> 2] | 0) == (f | 0) : 0) {
                j = -1094995529;
                i = g;
                return j | 0
            }
            j = d + 2524 | 0;
            if (c[(c[j >> 2] | 0) + 304 >> 2] | 0) {
                j = -12;
                i = g;
                return j | 0
            }
            if ((Tc(c[d + 4 >> 2] | 0, d + 2528 | 0, 1) | 0) < 0) {
                j = -12;
                i = g;
                return j | 0
            }
            k = d + 200 | 0;
            m = c[k >> 2] | 0;
            c[d + 2540 >> 2] = $(c[m + 13132 >> 2] | 0, c[m + 13128 >> 2] | 0) | 0;
            m = d + 4520 | 0;
            l = c[j >> 2] | 0;
            c[l + 244 >> 2] = (c[m >> 2] | 0) == 1 & 1;
            c[l + 240 >> 2] = ((c[m >> 2] | 0) + -1 | 0) >>> 0 < 2 & 1;
            c[e >> 2] = l;
            c[d + 2520 >> 2] = j;
            a[d + 2570 >> 0] = (a[d + 1450 >> 0] | 0) == 0 ? 2 : 3;
            c[d + 2544 >> 2] = f;
            b[d + 2568 >> 1] = b[h >> 1] | 0;
            j = d + 2552 | 0;
            f = (c[k >> 2] | 0) + 20 | 0;
            c[j + 0 >> 2] = c[f + 0 >> 2];
            c[j + 4 >> 2] = c[f + 4 >> 2];
            c[j + 8 >> 2] = c[f + 8 >> 2];
            c[j + 12 >> 2] = c[f + 12 >> 2];
            j = 0;
            i = g;
            return j | 0
        }

        function $b(d, e, f) {
            d = d | 0;
            e = e | 0;
            f = f | 0;
            var g = 0,
                h = 0,
                j = 0,
                k = 0,
                l = 0,
                m = 0,
                n = 0,
                o = 0,
                p = 0;
            g = i;
            l = d + 2046 | 0;
            k = d + 2572 | 0;
            h = d + 4366 | 0;
            n = (f | 0) == 0;
            m = d + 4364 | 0;
            f = d + 200 | 0;
            while (1) {
                if ((a[l >> 0] | 0) == 1) {
                    p = d + 2524 | 0;
                    o = d + 2570 | 0;
                    if (((a[o >> 0] & 8) == 0 ? (c[d + 2544 >> 2] | 0) != (c[k >> 2] | 0) : 0) ? (b[d + 2568 >> 1] | 0) == (b[h >> 1] | 0) : 0) Xb(d, p, 1)
                } else o = d + 2570 | 0;
                if (!(a[o >> 0] & 1)) o = 0;
                else o = (b[d + 2568 >> 1] | 0) == (b[h >> 1] | 0) & 1;
                if (((n ? (b[h >> 1] | 0) == (b[m >> 1] | 0) : 0) ? (j = c[f >> 2] | 0, (j | 0) != 0) : 0) ? (o | 0) <= (c[j + (((c[j + 72 >> 2] | 0) + -1 | 0) * 12 | 0) + 80 >> 2] | 0) : 0) {
                    d = 0;
                    h = 21;
                    break
                }
                if (o) {
                    h = 15;
                    break
                }
                o = b[h >> 1] | 0;
                if (o << 16 >> 16 == (b[m >> 1] | 0)) {
                    d = 0;
                    h = 21;
                    break
                }
                b[h >> 1] = (o & 65535) + 1 & 255
            }
            if ((h | 0) == 15) {
                h = d + 2524 | 0;
                e = Ad(e, c[h >> 2] | 0) | 0;
                if (!(a[d + 2570 >> 0] & 8)) Xb(d, h, 1);
                else Xb(d, h, 9);
                p = (e | 0) < 0 ? e : 1;
                i = g;
                return p | 0
            } else if ((h | 0) == 21) {
                i = g;
                return d | 0
            }
            return 0
        }

        function ac() {
            var b = 0,
                c = 0,
                d = 0,
                e = 0,
                f = 0;
            b = i;
            if (!(a[1664] | 0)) c = 0;
            else {
                i = b;
                return
            }
            do {
                d = 0;
                do {
                    f = ($(d << 1 | 1, c) | 0) & 127;
                    e = f >>> 0 > 63;
                    f = e ? f + -64 | 0 : f;
                    e = e ? -1 : 1;
                    if ((f | 0) > 31) {
                        f = 64 - f | 0;
                        e = 0 - e | 0
                    }
                    a[1664 + (c << 5) + d >> 0] = $(a[2688 + f >> 0] | 0, e) | 0;
                    d = d + 1 | 0
                } while ((d | 0) != 32);
                c = c + 1 | 0
            } while ((c | 0) != 32);
            i = b;
            return
        }

        function bc(a, b) {
            a = a | 0;
            b = b | 0;
            c[a >> 2] = 4;
            c[a + 4 >> 2] = 1;
            c[a + 8 >> 2] = 2;
            c[a + 12 >> 2] = 3;
            c[a + 16 >> 2] = 4;
            c[a + 20 >> 2] = 1;
            c[a + 24 >> 2] = 2;
            c[a + 28 >> 2] = 1;
            c[a + 32 >> 2] = 3;
            c[a + 36 >> 2] = 4;
            c[a + 40 >> 2] = 5;
            c[a + 44 >> 2] = 6;
            c[a + 48 >> 2] = 2;
            c[a + 52 >> 2] = 3;
            c[a + 56 >> 2] = 4;
            c[a + 60 >> 2] = 5;
            c[a + 64 >> 2] = 1;
            c[a + 68 >> 2] = 1;
            c[a + 72 >> 2] = 2;
            c[a + 1676 >> 2] = 5;
            c[a + 1680 >> 2] = 6;
            c[a + 1684 >> 2] = 1;
            c[a + 1688 >> 2] = 2;
            c[a + 1692 >> 2] = 5;
            c[a + 1696 >> 2] = 6;
            c[a + 1700 >> 2] = 1;
            c[a + 1704 >> 2] = 2;
            return
        }

        function cc(a, c, d, e, f, g, h) {
            a = a | 0;
            c = c | 0;
            d = d | 0;
            e = e | 0;
            f = f | 0;
            g = g | 0;
            h = h | 0;
            var j = 0,
                k = 0,
                l = 0,
                m = 0;
            j = i;
            c = c >>> 1;
            if ((e | 0) <= 0) {
                i = j;
                return
            }
            k = (d | 0) > 0;
            h = h - g | 0;
            l = 0;
            while (1) {
                if (k) {
                    m = 0;
                    do {
                        b[a + (m << 1) >> 1] = (_c(f, g) | 0) << h;
                        m = m + 1 | 0
                    } while ((m | 0) != (d | 0))
                }
                l = l + 1 | 0;
                if ((l | 0) == (e | 0)) break;
                else a = a + (c << 1) | 0
            }
            i = j;
            return
        }

        function dc(a, c, d, f) {
            a = a | 0;
            c = c | 0;
            d = d | 0;
            f = f | 0;
            var g = 0,
                h = 0,
                j = 0,
                k = 0,
                l = 0,
                m = 0,
                n = 0;
            g = i;
            d = d >>> 1;
            f = 1 << f;
            h = 0 - f | 0;
            f = f + -1 | 0;
            j = 0;
            while (1) {
                l = c;
                m = 0;
                while (1) {
                    k = a + (m << 1) | 0;
                    n = (b[l >> 1] | 0) + (e[k >> 1] | 0) | 0;
                    if (n & h) n = 0 - n >> 31 & f;
                    b[k >> 1] = n;
                    m = m + 1 | 0;
                    if ((m | 0) == 4) break;
                    else l = l + 2 | 0
                }
                j = j + 1 | 0;
                if ((j | 0) == 4) break;
                else {
                    c = c + 8 | 0;
                    a = a + (d << 1) | 0
                }
            }
            i = g;
            return
        }

        function ec(a, c, d, f) {
            a = a | 0;
            c = c | 0;
            d = d | 0;
            f = f | 0;
            var g = 0,
                h = 0,
                j = 0,
                k = 0,
                l = 0,
                m = 0,
                n = 0;
            g = i;
            d = d >>> 1;
            f = 1 << f;
            h = 0 - f | 0;
            f = f + -1 | 0;
            j = 0;
            while (1) {
                l = c;
                m = 0;
                while (1) {
                    k = a + (m << 1) | 0;
                    n = (b[l >> 1] | 0) + (e[k >> 1] | 0) | 0;
                    if (n & h) n = 0 - n >> 31 & f;
                    b[k >> 1] = n;
                    m = m + 1 | 0;
                    if ((m | 0) == 8) break;
                    else l = l + 2 | 0
                }
                j = j + 1 | 0;
                if ((j | 0) == 8) break;
                else {
                    c = c + 16 | 0;
                    a = a + (d << 1) | 0
                }
            }
            i = g;
            return
        }

        function fc(a, c, d, f) {
            a = a | 0;
            c = c | 0;
            d = d | 0;
            f = f | 0;
            var g = 0,
                h = 0,
                j = 0,
                k = 0,
                l = 0,
                m = 0,
                n = 0;
            g = i;
            d = d >>> 1;
            f = 1 << f;
            h = 0 - f | 0;
            f = f + -1 | 0;
            j = 0;
            while (1) {
                l = c;
                m = 0;
                while (1) {
                    k = a + (m << 1) | 0;
                    n = (b[l >> 1] | 0) + (e[k >> 1] | 0) | 0;
                    if (n & h) n = 0 - n >> 31 & f;
                    b[k >> 1] = n;
                    m = m + 1 | 0;
                    if ((m | 0) == 16) break;
                    else l = l + 2 | 0
                }
                j = j + 1 | 0;
                if ((j | 0) == 16) break;
                else {
                    c = c + 32 | 0;
                    a = a + (d << 1) | 0
                }
            }
            i = g;
            return
        }

        function gc(a, c, d, f) {
            a = a | 0;
            c = c | 0;
            d = d | 0;
            f = f | 0;
            var g = 0,
                h = 0,
                j = 0,
                k = 0,
                l = 0,
                m = 0,
                n = 0;
            g = i;
            d = d >>> 1;
            f = 1 << f;
            h = 0 - f | 0;
            f = f + -1 | 0;
            j = 0;
            while (1) {
                l = c;
                m = 0;
                while (1) {
                    k = a + (m << 1) | 0;
                    n = (b[l >> 1] | 0) + (e[k >> 1] | 0) | 0;
                    if (n & h) n = 0 - n >> 31 & f;
                    b[k >> 1] = n;
                    m = m + 1 | 0;
                    if ((m | 0) == 32) break;
                    else l = l + 2 | 0
                }
                j = j + 1 | 0;
                if ((j | 0) == 32) break;
                else {
                    c = c + 64 | 0;
                    a = a + (d << 1) | 0
                }
            }
            i = g;
            return
        }

        function hc(a, c, d) {
            a = a | 0;
            c = c | 0;
            d = d | 0;
            var e = 0,
                f = 0,
                g = 0,
                h = 0,
                j = 0;
            e = i;
            c = c << 16 >> 16;
            d = 15 - d - c | 0;
            c = 1 << c;
            if ((d | 0) > 0) {
                f = 1 << d + -1;
                if ((c | 0) > 0) {
                    h = a;
                    a = 0
                } else {
                    i = e;
                    return
                }
                while (1) {
                    j = h;
                    g = 0;
                    while (1) {
                        b[j >> 1] = (b[j >> 1] | 0) + f >> d;
                        g = g + 1 | 0;
                        if ((g | 0) == (c | 0)) break;
                        else j = j + 2 | 0
                    }
                    a = a + 1 | 0;
                    if ((a | 0) == (c | 0)) break;
                    else h = h + (c << 1) | 0
                }
                i = e;
                return
            }
            if ((c | 0) <= 0) {
                i = e;
                return
            }
            d = 0 - d | 0;
            f = 0;
            while (1) {
                g = a;
                h = 0;
                while (1) {
                    b[g >> 1] = b[g >> 1] << d;
                    h = h + 1 | 0;
                    if ((h | 0) == (c | 0)) break;
                    else g = g + 2 | 0
                }
                f = f + 1 | 0;
                if ((f | 0) == (c | 0)) break;
                else a = a + (c << 1) | 0
            }
            i = e;
            return
        }

        function ic(a, c, d) {
            a = a | 0;
            c = c | 0;
            d = d | 0;
            var f = 0,
                g = 0,
                h = 0,
                j = 0,
                k = 0;
            f = i;
            c = 1 << (c << 16 >> 16);
            if (d) {
                d = c + -1 | 0;
                if ((d | 0) <= 0) {
                    i = f;
                    return
                }
                g = (c | 0) > 0;
                h = 0;
                do {
                    if (g) {
                        j = 0;
                        do {
                            k = a + (j + c << 1) | 0;
                            b[k >> 1] = (e[k >> 1] | 0) + (e[a + (j << 1) >> 1] | 0);
                            j = j + 1 | 0
                        } while ((j | 0) != (c | 0))
                    }
                    a = a + (c << 1) | 0;
                    h = h + 1 | 0
                } while ((h | 0) != (d | 0));
                i = f;
                return
            }
            if ((c | 0) <= 0) {
                i = f;
                return
            }
            d = (c | 0) > 1;
            h = 0;
            while (1) {
                if (d) {
                    j = b[a >> 1] | 0;
                    g = 1;
                    do {
                        k = a + (g << 1) | 0;
                        j = (e[k >> 1] | 0) + (j & 65535) & 65535;
                        b[k >> 1] = j;
                        g = g + 1 | 0
                    } while ((g | 0) != (c | 0))
                }
                h = h + 1 | 0;
                if ((h | 0) == (c | 0)) break;
                else a = a + (c << 1) | 0
            }
            i = f;
            return
        }

        function jc(a, c) {
            a = a | 0;
            c = c | 0;
            var d = 0,
                e = 0,
                f = 0,
                g = 0,
                h = 0,
                j = 0,
                k = 0,
                l = 0,
                m = 0,
                n = 0,
                o = 0,
                p = 0,
                q = 0;
            d = i;
            e = 0;
            g = a;
            while (1) {
                q = b[g >> 1] | 0;
                n = g + 16 | 0;
                o = b[n >> 1] | 0;
                h = o + q | 0;
                f = g + 24 | 0;
                p = b[f >> 1] | 0;
                m = p + o | 0;
                j = q - p | 0;
                l = g + 8 | 0;
                k = (b[l >> 1] | 0) * 74 | 0;
                p = ((q - o + p | 0) * 74 | 0) + 64 | 0;
                o = p >> 7;
                if ((o + 32768 | 0) >>> 0 > 65535) o = p >> 31 ^ 32767;
                b[n >> 1] = o;
                o = (h * 29 | 0) + 64 + (m * 55 | 0) + k | 0;
                n = o >> 7;
                if ((n + 32768 | 0) >>> 0 > 65535) n = o >> 31 ^ 32767;
                b[g >> 1] = n;
                m = ($(m, -29) | 0) + 64 + (j * 55 | 0) + k | 0;
                n = m >> 7;
                if ((n + 32768 | 0) >>> 0 > 65535) n = m >> 31 ^ 32767;
                b[l >> 1] = n;
                j = (h * 55 | 0) + 64 + (j * 29 | 0) - k | 0;
                h = j >> 7;
                if ((h + 32768 | 0) >>> 0 > 65535) h = j >> 31 ^ 32767;
                b[f >> 1] = h;
                e = e + 1 | 0;
                if ((e | 0) == 4) break;
                else g = g + 2 | 0
            }
            e = 20 - c | 0;
            c = 1 << e + -1;
            g = 0;
            while (1) {
                p = b[a >> 1] | 0;
                n = a + 4 | 0;
                q = b[n >> 1] | 0;
                l = q + p | 0;
                f = a + 6 | 0;
                o = b[f >> 1] | 0;
                m = o + q | 0;
                h = p - o | 0;
                k = a + 2 | 0;
                j = (b[k >> 1] | 0) * 74 | 0;
                o = ((p - q + o | 0) * 74 | 0) + c >> e;
                if ((o + 32768 | 0) >>> 0 > 65535) o = o >> 31 ^ 32767;
                b[n >> 1] = o;
                n = (l * 29 | 0) + c + (m * 55 | 0) + j >> e;
                if ((n + 32768 | 0) >>> 0 > 65535) n = n >> 31 ^ 32767;
                b[a >> 1] = n;
                m = ($(m, -29) | 0) + c + (h * 55 | 0) + j >> e;
                if ((m + 32768 | 0) >>> 0 > 65535) m = m >> 31 ^ 32767;
                b[k >> 1] = m;
                h = (l * 55 | 0) + c + (h * 29 | 0) - j >> e;
                if ((h + 32768 | 0) >>> 0 > 65535) h = h >> 31 ^ 32767;
                b[f >> 1] = h;
                g = g + 1 | 0;
                if ((g | 0) == 4) break;
                else a = a + 8 | 0
            }
            i = d;
            return
        }

        function kc(a, c, d) {
            a = a | 0;
            c = c | 0;
            d = d | 0;
            var e = 0,
                f = 0,
                g = 0,
                h = 0,
                j = 0,
                k = 0,
                l = 0,
                m = 0,
                n = 0,
                o = 0,
                p = 0;
            c = i;
            e = 0;
            g = a;
            while (1) {
                n = b[g >> 1] << 6;
                k = g + 16 | 0;
                m = b[k >> 1] << 6;
                j = m + n | 0;
                m = n - m | 0;
                n = g + 8 | 0;
                l = b[n >> 1] | 0;
                f = g + 24 | 0;
                o = b[f >> 1] | 0;
                h = (o * 36 | 0) + (l * 83 | 0) | 0;
                l = ($(o, -83) | 0) + (l * 36 | 0) | 0;
                o = j + 64 + h | 0;
                p = o >> 7;
                if ((p + 32768 | 0) >>> 0 > 65535) p = o >> 31 ^ 32767;
                b[g >> 1] = p;
                p = m + 64 + l | 0;
                o = p >> 7;
                if ((o + 32768 | 0) >>> 0 > 65535) o = p >> 31 ^ 32767;
                b[n >> 1] = o;
                l = m - l + 64 | 0;
                m = l >> 7;
                if ((m + 32768 | 0) >>> 0 > 65535) m = l >> 31 ^ 32767;
                b[k >> 1] = m;
                j = j - h + 64 | 0;
                h = j >> 7;
                if ((h + 32768 | 0) >>> 0 > 65535) h = j >> 31 ^ 32767;
                b[f >> 1] = h;
                e = e + 1 | 0;
                if ((e | 0) == 4) break;
                else g = g + 2 | 0
            }
            e = 20 - d | 0;
            d = 1 << e + -1;
            g = 0;
            while (1) {
                n = b[a >> 1] << 6;
                k = a + 4 | 0;
                o = b[k >> 1] << 6;
                m = a + 2 | 0;
                l = b[m >> 1] | 0;
                f = a + 6 | 0;
                j = b[f >> 1] | 0;
                h = (j * 36 | 0) + (l * 83 | 0) | 0;
                l = ($(j, -83) | 0) + (l * 36 | 0) | 0;
                j = o + n + d | 0;
                p = j + h >> e;
                if ((p + 32768 | 0) >>> 0 > 65535) p = p >> 31 ^ 32767;
                b[a >> 1] = p;
                n = n - o + d | 0;
                o = n + l >> e;
                if ((o + 32768 | 0) >>> 0 > 65535) o = o >> 31 ^ 32767;
                b[m >> 1] = o;
                l = n - l >> e;
                if ((l + 32768 | 0) >>> 0 > 65535) l = l >> 31 ^ 32767;
                b[k >> 1] = l;
                h = j - h >> e;
                if ((h + 32768 | 0) >>> 0 > 65535) h = h >> 31 ^ 32767;
                b[f >> 1] = h;
                g = g + 1 | 0;
                if ((g | 0) == 4) break;
                else a = a + 8 | 0
            }
            i = c;
            return
        }

        function lc(d, e, f) {
            d = d | 0;
            e = e | 0;
            f = f | 0;
            var g = 0,
                h = 0,
                j = 0,
                k = 0,
                l = 0,
                m = 0,
                n = 0,
                o = 0,
                p = 0,
                q = 0,
                r = 0,
                s = 0,
                t = 0,
                u = 0,
                v = 0,
                w = 0,
                x = 0;
            j = i;
            i = i + 64 | 0;
            r = j + 48 | 0;
            p = j + 32 | 0;
            g = j + 16 | 0;
            h = j;
            q = (e | 0) > 8;
            s = e + 4 | 0;
            k = r + 4 | 0;
            l = r + 8 | 0;
            m = r + 12 | 0;
            o = 0;
            s = (s | 0) > 8 ? 8 : s;
            n = d;
            while (1) {
                c[p + 0 >> 2] = 0;
                c[p + 4 >> 2] = 0;
                c[p + 8 >> 2] = 0;
                c[p + 12 >> 2] = 0;
                w = (s | 0) > 1;
                t = 0;
                do {
                    if (w) {
                        v = p + (t << 2) | 0;
                        u = c[v >> 2] | 0;
                        x = 1;
                        do {
                            u = ($(b[n + (x << 3 << 1) >> 1] | 0, a[1664 + (x << 2 << 5) + t >> 0] | 0) | 0) + u | 0;
                            x = x + 2 | 0
                        } while ((x | 0) < (s | 0));
                        c[v >> 2] = u
                    }
                    t = t + 1 | 0
                } while ((t | 0) != 4);
                w = b[n >> 1] << 6;
                v = b[n + 64 >> 1] << 6;
                x = v + w | 0;
                v = w - v | 0;
                w = b[n + 32 >> 1] | 0;
                u = b[n + 96 >> 1] | 0;
                t = (u * 36 | 0) + (w * 83 | 0) | 0;
                w = ($(u, -83) | 0) + (w * 36 | 0) | 0;
                u = t + x | 0;
                c[r >> 2] = u;
                c[k >> 2] = w + v;
                c[l >> 2] = v - w;
                c[m >> 2] = x - t;
                t = 0;
                while (1) {
                    v = c[p + (t << 2) >> 2] | 0;
                    w = u + 64 + v | 0;
                    x = w >> 7;
                    if ((x + 32768 | 0) >>> 0 > 65535) x = w >> 31 ^ 32767;
                    b[n + (t << 3 << 1) >> 1] = x;
                    v = u - v + 64 | 0;
                    u = v >> 7;
                    if ((u + 32768 | 0) >>> 0 > 65535) u = v >> 31 ^ 32767;
                    b[n + (7 - t << 3 << 1) >> 1] = u;
                    t = t + 1 | 0;
                    if ((t | 0) == 4) break;
                    u = c[r + (t << 2) >> 2] | 0
                }
                if ((s | 0) < 8) s = (o & 3 | 0) == 0 & (o | 0) != 0 ? s + -4 | 0 : s;
                o = o + 1 | 0;
                if ((o | 0) == 8) break;
                else n = n + 2 | 0
            }
            k = q ? 8 : e;
            l = 20 - f | 0;
            m = 1 << l + -1;
            f = (k | 0) > 1;
            n = g + 4 | 0;
            o = g + 8 | 0;
            e = g + 12 | 0;
            p = 0;
            while (1) {
                c[h + 0 >> 2] = 0;
                c[h + 4 >> 2] = 0;
                c[h + 8 >> 2] = 0;
                c[h + 12 >> 2] = 0;
                t = 0;
                do {
                    if (f) {
                        q = h + (t << 2) | 0;
                        s = c[q >> 2] | 0;
                        r = 1;
                        do {
                            s = ($(b[d + (r << 1) >> 1] | 0, a[1664 + (r << 2 << 5) + t >> 0] | 0) | 0) + s | 0;
                            r = r + 2 | 0
                        } while ((r | 0) < (k | 0));
                        c[q >> 2] = s
                    }
                    t = t + 1 | 0
                } while ((t | 0) != 4);
                w = b[d >> 1] << 6;
                v = b[d + 8 >> 1] << 6;
                x = v + w | 0;
                v = w - v | 0;
                w = b[d + 4 >> 1] | 0;
                s = b[d + 12 >> 1] | 0;
                q = (s * 36 | 0) + (w * 83 | 0) | 0;
                w = ($(s, -83) | 0) + (w * 36 | 0) | 0;
                s = q + x | 0;
                c[g >> 2] = s;
                c[n >> 2] = w + v;
                c[o >> 2] = v - w;
                c[e >> 2] = x - q;
                q = 0;
                while (1) {
                    r = c[h + (q << 2) >> 2] | 0;
                    s = s + m | 0;
                    t = s + r >> l;
                    if ((t + 32768 | 0) >>> 0 > 65535) t = t >> 31 ^ 32767;
                    b[d + (q << 1) >> 1] = t;
                    r = s - r >> l;
                    if ((r + 32768 | 0) >>> 0 > 65535) r = r >> 31 ^ 32767;
                    b[d + (7 - q << 1) >> 1] = r;
                    q = q + 1 | 0;
                    if ((q | 0) == 4) break;
                    s = c[g + (q << 2) >> 2] | 0
                }
                p = p + 1 | 0;
                if ((p | 0) == 8) break;
                else d = d + 16 | 0
            }
            i = j;
            return
        }

        function mc(d, e, f) {
            d = d | 0;
            e = e | 0;
            f = f | 0;
            var g = 0,
                h = 0,
                j = 0,
                k = 0,
                l = 0,
                m = 0,
                n = 0,
                o = 0,
                p = 0,
                q = 0,
                r = 0,
                s = 0,
                t = 0,
                u = 0,
                v = 0,
                w = 0,
                x = 0,
                y = 0,
                z = 0,
                A = 0,
                B = 0;
            g = i;
            i = i + 192 | 0;
            t = g + 160 | 0;
            u = g + 128 | 0;
            v = g + 112 | 0;
            s = g + 96 | 0;
            j = g + 64 | 0;
            l = g + 32 | 0;
            h = g + 16 | 0;
            k = g;
            m = (e | 0) > 16;
            w = e + 4 | 0;
            n = v + 4 | 0;
            o = v + 8 | 0;
            p = v + 12 | 0;
            r = 0;
            w = (w | 0) > 16 ? 16 : w;
            q = d;
            while (1) {
                c[u + 0 >> 2] = 0;
                c[u + 4 >> 2] = 0;
                c[u + 8 >> 2] = 0;
                c[u + 12 >> 2] = 0;
                c[u + 16 >> 2] = 0;
                c[u + 20 >> 2] = 0;
                c[u + 24 >> 2] = 0;
                c[u + 28 >> 2] = 0;
                A = (w | 0) > 1;
                B = 0;
                do {
                    if (A) {
                        z = u + (B << 2) | 0;
                        x = c[z >> 2] | 0;
                        y = 1;
                        do {
                            x = ($(b[q + (y << 4 << 1) >> 1] | 0, a[1664 + (y << 1 << 5) + B >> 0] | 0) | 0) + x | 0;
                            y = y + 2 | 0
                        } while ((y | 0) < (w | 0));
                        c[z >> 2] = x
                    }
                    B = B + 1 | 0
                } while ((B | 0) != 8);
                c[s + 0 >> 2] = 0;
                c[s + 4 >> 2] = 0;
                c[s + 8 >> 2] = 0;
                c[s + 12 >> 2] = 0;
                y = 0;
                do {
                    x = s + (y << 2) | 0;
                    A = c[x >> 2] | 0;
                    z = 1;
                    do {
                        A = ($(b[q + (z << 5 << 1) >> 1] | 0, a[1664 + (z << 2 << 5) + y >> 0] | 0) | 0) + A | 0;
                        z = z + 2 | 0
                    } while ((z | 0) < 8);
                    c[x >> 2] = A;
                    y = y + 1 | 0
                } while ((y | 0) != 4);
                A = b[q >> 1] << 6;
                z = b[q + 256 >> 1] << 6;
                B = z + A | 0;
                z = A - z | 0;
                A = b[q + 128 >> 1] | 0;
                x = b[q + 384 >> 1] | 0;
                y = (x * 36 | 0) + (A * 83 | 0) | 0;
                A = ($(x, -83) | 0) + (A * 36 | 0) | 0;
                x = y + B | 0;
                c[v >> 2] = x;
                c[n >> 2] = A + z;
                c[o >> 2] = z - A;
                c[p >> 2] = B - y;
                y = 0;
                while (1) {
                    B = c[s + (y << 2) >> 2] | 0;
                    c[t + (y << 2) >> 2] = B + x;
                    c[t + (7 - y << 2) >> 2] = x - B;
                    y = y + 1 | 0;
                    if ((y | 0) == 4) {
                        x = 0;
                        break
                    }
                    x = c[v + (y << 2) >> 2] | 0
                }
                do {
                    z = c[t + (x << 2) >> 2] | 0;
                    y = c[u + (x << 2) >> 2] | 0;
                    B = z + 64 + y | 0;
                    A = B >> 7;
                    if ((A + 32768 | 0) >>> 0 > 65535) A = B >> 31 ^ 32767;
                    b[q + (x << 4 << 1) >> 1] = A;
                    y = z - y + 64 | 0;
                    z = y >> 7;
                    if ((z + 32768 | 0) >>> 0 > 65535) z = y >> 31 ^ 32767;
                    b[q + (15 - x << 4 << 1) >> 1] = z;
                    x = x + 1 | 0
                } while ((x | 0) != 8);
                if ((w | 0) < 16) w = (r & 3 | 0) == 0 & (r | 0) != 0 ? w + -4 | 0 : w;
                r = r + 1 | 0;
                if ((r | 0) == 16) break;
                else q = q + 2 | 0
            }
            m = m ? 16 : e;
            f = 20 - f | 0;
            n = 1 << f + -1;
            q = (m | 0) > 1;
            o = h + 4 | 0;
            r = h + 8 | 0;
            p = h + 12 | 0;
            s = 0;
            while (1) {
                c[l + 0 >> 2] = 0;
                c[l + 4 >> 2] = 0;
                c[l + 8 >> 2] = 0;
                c[l + 12 >> 2] = 0;
                c[l + 16 >> 2] = 0;
                c[l + 20 >> 2] = 0;
                c[l + 24 >> 2] = 0;
                c[l + 28 >> 2] = 0;
                v = 0;
                do {
                    if (q) {
                        e = l + (v << 2) | 0;
                        u = c[e >> 2] | 0;
                        t = 1;
                        do {
                            u = ($(b[d + (t << 1) >> 1] | 0, a[1664 + (t << 1 << 5) + v >> 0] | 0) | 0) + u | 0;
                            t = t + 2 | 0
                        } while ((t | 0) < (m | 0));
                        c[e >> 2] = u
                    }
                    v = v + 1 | 0
                } while ((v | 0) != 8);
                c[k + 0 >> 2] = 0;
                c[k + 4 >> 2] = 0;
                c[k + 8 >> 2] = 0;
                c[k + 12 >> 2] = 0;
                e = 0;
                do {
                    t = k + (e << 2) | 0;
                    v = c[t >> 2] | 0;
                    u = 1;
                    do {
                        v = ($(b[d + (u << 1 << 1) >> 1] | 0, a[1664 + (u << 2 << 5) + e >> 0] | 0) | 0) + v | 0;
                        u = u + 2 | 0
                    } while ((u | 0) < 8);
                    c[t >> 2] = v;
                    e = e + 1 | 0
                } while ((e | 0) != 4);
                A = b[d >> 1] << 6;
                z = b[d + 16 >> 1] << 6;
                B = z + A | 0;
                z = A - z | 0;
                A = b[d + 8 >> 1] | 0;
                t = b[d + 24 >> 1] | 0;
                u = (t * 36 | 0) + (A * 83 | 0) | 0;
                A = ($(t, -83) | 0) + (A * 36 | 0) | 0;
                t = u + B | 0;
                c[h >> 2] = t;
                c[o >> 2] = A + z;
                c[r >> 2] = z - A;
                c[p >> 2] = B - u;
                u = 0;
                while (1) {
                    B = c[k + (u << 2) >> 2] | 0;
                    c[j + (u << 2) >> 2] = B + t;
                    c[j + (7 - u << 2) >> 2] = t - B;
                    u = u + 1 | 0;
                    if ((u | 0) == 4) {
                        t = 0;
                        break
                    }
                    t = c[h + (u << 2) >> 2] | 0
                }
                do {
                    u = c[l + (t << 2) >> 2] | 0;
                    v = (c[j + (t << 2) >> 2] | 0) + n | 0;
                    e = v + u >> f;
                    if ((e + 32768 | 0) >>> 0 > 65535) e = e >> 31 ^ 32767;
                    b[d + (t << 1) >> 1] = e;
                    u = v - u >> f;
                    if ((u + 32768 | 0) >>> 0 > 65535) u = u >> 31 ^ 32767;
                    b[d + (15 - t << 1) >> 1] = u;
                    t = t + 1 | 0
                } while ((t | 0) != 8);
                s = s + 1 | 0;
                if ((s | 0) == 16) break;
                else d = d + 32 | 0
            }
            i = g;
            return
        }

        function nc(d, e, f) {
            d = d | 0;
            e = e | 0;
            f = f | 0;
            var g = 0,
                h = 0,
                j = 0,
                k = 0,
                l = 0,
                m = 0,
                n = 0,
                o = 0,
                p = 0,
                q = 0,
                r = 0,
                s = 0,
                t = 0,
                u = 0,
                v = 0,
                w = 0,
                x = 0,
                y = 0,
                z = 0,
                A = 0,
                B = 0,
                C = 0,
                D = 0,
                E = 0;
            g = i;
            i = i + 320 | 0;
            h = g + 256 | 0;
            n = g + 192 | 0;
            o = g + 160 | 0;
            s = g + 128 | 0;
            u = g + 112 | 0;
            t = g + 96 | 0;
            m = g + 64 | 0;
            k = g + 32 | 0;
            j = g + 16 | 0;
            l = g;
            q = (e | 0) > 32;
            y = e + 4 | 0;
            v = u + 4 | 0;
            w = u + 8 | 0;
            x = u + 12 | 0;
            p = 0;
            y = (y | 0) > 32 ? 32 : y;
            r = d;
            while (1) {
                z = n + 0 | 0;
                A = z + 64 | 0;
                do {
                    c[z >> 2] = 0;
                    z = z + 4 | 0
                } while ((z | 0) < (A | 0));
                z = (y | 0) > 1;
                C = 0;
                do {
                    if (z) {
                        B = n + (C << 2) | 0;
                        A = c[B >> 2] | 0;
                        D = 1;
                        do {
                            A = ($(b[r + (D << 5 << 1) >> 1] | 0, a[1664 + (D << 5) + C >> 0] | 0) | 0) + A | 0;
                            D = D + 2 | 0
                        } while ((D | 0) < (y | 0));
                        c[B >> 2] = A
                    }
                    C = C + 1 | 0
                } while ((C | 0) != 16);
                c[s + 0 >> 2] = 0;
                c[s + 4 >> 2] = 0;
                c[s + 8 >> 2] = 0;
                c[s + 12 >> 2] = 0;
                c[s + 16 >> 2] = 0;
                c[s + 20 >> 2] = 0;
                c[s + 24 >> 2] = 0;
                c[s + 28 >> 2] = 0;
                z = (y | 0) / 2 | 0;
                A = (y | 0) > 3;
                B = 0;
                do {
                    if (A) {
                        C = s + (B << 2) | 0;
                        D = c[C >> 2] | 0;
                        E = 1;
                        do {
                            D = ($(b[r + (E << 6 << 1) >> 1] | 0, a[1664 + (E << 1 << 5) + B >> 0] | 0) | 0) + D | 0;
                            E = E + 2 | 0
                        } while ((E | 0) < (z | 0));
                        c[C >> 2] = D
                    }
                    B = B + 1 | 0
                } while ((B | 0) != 8);
                c[t + 0 >> 2] = 0;
                c[t + 4 >> 2] = 0;
                c[t + 8 >> 2] = 0;
                c[t + 12 >> 2] = 0;
                C = 0;
                do {
                    z = t + (C << 2) | 0;
                    B = c[z >> 2] | 0;
                    A = 1;
                    do {
                        B = ($(b[r + (A << 7 << 1) >> 1] | 0, a[1664 + (A << 2 << 5) + C >> 0] | 0) | 0) + B | 0;
                        A = A + 2 | 0
                    } while ((A | 0) < 8);
                    c[z >> 2] = B;
                    C = C + 1 | 0
                } while ((C | 0) != 4);
                D = b[r >> 1] << 6;
                C = b[r + 1024 >> 1] << 6;
                E = C + D | 0;
                C = D - C | 0;
                D = b[r + 512 >> 1] | 0;
                z = b[r + 1536 >> 1] | 0;
                A = (z * 36 | 0) + (D * 83 | 0) | 0;
                D = ($(z, -83) | 0) + (D * 36 | 0) | 0;
                z = A + E | 0;
                c[u >> 2] = z;
                c[v >> 2] = D + C;
                c[w >> 2] = C - D;
                c[x >> 2] = E - A;
                A = 0;
                while (1) {
                    E = c[t + (A << 2) >> 2] | 0;
                    c[o + (A << 2) >> 2] = E + z;
                    c[o + (7 - A << 2) >> 2] = z - E;
                    A = A + 1 | 0;
                    if ((A | 0) == 4) {
                        z = 0;
                        break
                    }
                    z = c[u + (A << 2) >> 2] | 0
                }
                do {
                    D = c[o + (z << 2) >> 2] | 0;
                    E = c[s + (z << 2) >> 2] | 0;
                    c[h + (z << 2) >> 2] = E + D;
                    c[h + (15 - z << 2) >> 2] = D - E;
                    z = z + 1 | 0
                } while ((z | 0) != 8);
                z = 0;
                do {
                    A = c[h + (z << 2) >> 2] | 0;
                    B = c[n + (z << 2) >> 2] | 0;
                    D = A + 64 + B | 0;
                    C = D >> 7;
                    if ((C + 32768 | 0) >>> 0 > 65535) C = D >> 31 ^ 32767;
                    b[r + (z << 5 << 1) >> 1] = C;
                    A = A - B + 64 | 0;
                    B = A >> 7;
                    if ((B + 32768 | 0) >>> 0 > 65535) B = A >> 31 ^ 32767;
                    b[r + (31 - z << 5 << 1) >> 1] = B;
                    z = z + 1 | 0
                } while ((z | 0) != 16);
                if ((y | 0) < 32) y = (p & 3 | 0) == 0 & (p | 0) != 0 ? y + -4 | 0 : y;
                p = p + 1 | 0;
                if ((p | 0) == 32) break;
                else r = r + 2 | 0
            }
            o = q ? 32 : e;
            e = 20 - f | 0;
            s = 1 << e + -1;
            f = (o | 0) > 1;
            r = (o | 0) / 2 | 0;
            q = (o | 0) > 3;
            p = j + 4 | 0;
            t = j + 8 | 0;
            u = j + 12 | 0;
            v = 0;
            while (1) {
                z = n + 0 | 0;
                A = z + 64 | 0;
                do {
                    c[z >> 2] = 0;
                    z = z + 4 | 0
                } while ((z | 0) < (A | 0));
                z = 0;
                do {
                    if (f) {
                        w = n + (z << 2) | 0;
                        y = c[w >> 2] | 0;
                        x = 1;
                        do {
                            y = ($(b[d + (x << 1) >> 1] | 0, a[1664 + (x << 5) + z >> 0] | 0) | 0) + y | 0;
                            x = x + 2 | 0
                        } while ((x | 0) < (o | 0));
                        c[w >> 2] = y
                    }
                    z = z + 1 | 0
                } while ((z | 0) != 16);
                c[k + 0 >> 2] = 0;
                c[k + 4 >> 2] = 0;
                c[k + 8 >> 2] = 0;
                c[k + 12 >> 2] = 0;
                c[k + 16 >> 2] = 0;
                c[k + 20 >> 2] = 0;
                c[k + 24 >> 2] = 0;
                c[k + 28 >> 2] = 0;
                z = 0;
                do {
                    if (q) {
                        w = k + (z << 2) | 0;
                        y = c[w >> 2] | 0;
                        x = 1;
                        do {
                            E = x << 1;
                            y = ($(b[d + (E << 1) >> 1] | 0, a[1664 + (E << 5) + z >> 0] | 0) | 0) + y | 0;
                            x = x + 2 | 0
                        } while ((x | 0) < (r | 0));
                        c[w >> 2] = y
                    }
                    z = z + 1 | 0
                } while ((z | 0) != 8);
                c[l + 0 >> 2] = 0;
                c[l + 4 >> 2] = 0;
                c[l + 8 >> 2] = 0;
                c[l + 12 >> 2] = 0;
                w = 0;
                do {
                    x = l + (w << 2) | 0;
                    z = c[x >> 2] | 0;
                    y = 1;
                    do {
                        E = y << 2;
                        z = ($(b[d + (E << 1) >> 1] | 0, a[1664 + (E << 5) + w >> 0] | 0) | 0) + z | 0;
                        y = y + 2 | 0
                    } while ((y | 0) < 8);
                    c[x >> 2] = z;
                    w = w + 1 | 0
                } while ((w | 0) != 4);
                D = b[d >> 1] << 6;
                C = b[d + 32 >> 1] << 6;
                E = C + D | 0;
                C = D - C | 0;
                D = b[d + 16 >> 1] | 0;
                w = b[d + 48 >> 1] | 0;
                x = (w * 36 | 0) + (D * 83 | 0) | 0;
                D = ($(w, -83) | 0) + (D * 36 | 0) | 0;
                w = x + E | 0;
                c[j >> 2] = w;
                c[p >> 2] = D + C;
                c[t >> 2] = C - D;
                c[u >> 2] = E - x;
                x = 0;
                while (1) {
                    E = c[l + (x << 2) >> 2] | 0;
                    c[m + (x << 2) >> 2] = E + w;
                    c[m + (7 - x << 2) >> 2] = w - E;
                    x = x + 1 | 0;
                    if ((x | 0) == 4) {
                        w = 0;
                        break
                    }
                    w = c[j + (x << 2) >> 2] | 0
                }
                do {
                    D = c[m + (w << 2) >> 2] | 0;
                    E = c[k + (w << 2) >> 2] | 0;
                    c[h + (w << 2) >> 2] = E + D;
                    c[h + (15 - w << 2) >> 2] = D - E;
                    w = w + 1 | 0
                } while ((w | 0) != 8);
                w = 0;
                do {
                    x = c[n + (w << 2) >> 2] | 0;
                    y = (c[h + (w << 2) >> 2] | 0) + s | 0;
                    z = y + x >> e;
                    if ((z + 32768 | 0) >>> 0 > 65535) z = z >> 31 ^ 32767;
                    b[d + (w << 1) >> 1] = z;
                    x = y - x >> e;
                    if ((x + 32768 | 0) >>> 0 > 65535) x = x >> 31 ^ 32767;
                    b[d + (31 - w << 1) >> 1] = x;
                    w = w + 1 | 0
                } while ((w | 0) != 16);
                v = v + 1 | 0;
                if ((v | 0) == 32) break;
                else d = d + 64 | 0
            }
            i = g;
            return
        }

        function oc(a, c) {
            a = a | 0;
            c = c | 0;
            var d = 0,
                e = 0,
                f = 0;
            d = i;
            c = 14 - c | 0;
            c = ((b[a >> 1] | 0) + 1 >> 1) + (1 << c + -1) >> c & 65535;
            e = 0;
            do {
                f = e << 2;
                b[a + (f << 1) >> 1] = c;
                b[a + ((f | 1) << 1) >> 1] = c;
                b[a + ((f | 2) << 1) >> 1] = c;
                b[a + ((f | 3) << 1) >> 1] = c;
                e = e + 1 | 0
            } while ((e | 0) != 4);
            i = d;
            return
        }

        function pc(a, c) {
            a = a | 0;
            c = c | 0;
            var d = 0,
                e = 0,
                f = 0;
            d = i;
            c = 14 - c | 0;
            c = ((b[a >> 1] | 0) + 1 >> 1) + (1 << c + -1) >> c & 65535;
            e = 0;
            do {
                f = e << 3;
                b[a + (f << 1) >> 1] = c;
                b[a + ((f | 1) << 1) >> 1] = c;
                b[a + ((f | 2) << 1) >> 1] = c;
                b[a + ((f | 3) << 1) >> 1] = c;
                b[a + ((f | 4) << 1) >> 1] = c;
                b[a + ((f | 5) << 1) >> 1] = c;
                b[a + ((f | 6) << 1) >> 1] = c;
                b[a + ((f | 7) << 1) >> 1] = c;
                e = e + 1 | 0
            } while ((e | 0) != 8);
            i = d;
            return
        }

        function qc(a, c) {
            a = a | 0;
            c = c | 0;
            var d = 0,
                e = 0,
                f = 0,
                g = 0;
            d = i;
            e = 14 - c | 0;
            e = ((b[a >> 1] | 0) + 1 >> 1) + (1 << e + -1) >> e & 65535;
            c = 0;
            do {
                f = c << 4;
                g = 0;
                do {
                    b[a + (g + f << 1) >> 1] = e;
                    g = g + 1 | 0
                } while ((g | 0) != 16);
                c = c + 1 | 0
            } while ((c | 0) != 16);
            i = d;
            return
        }

        function rc(a, c) {
            a = a | 0;
            c = c | 0;
            var d = 0,
                e = 0,
                f = 0,
                g = 0;
            d = i;
            e = 14 - c | 0;
            e = ((b[a >> 1] | 0) + 1 >> 1) + (1 << e + -1) >> e & 65535;
            c = 0;
            do {
                f = c << 5;
                g = 0;
                do {
                    b[a + (g + f << 1) >> 1] = e;
                    g = g + 1 | 0
                } while ((g | 0) != 32);
                c = c + 1 | 0
            } while ((c | 0) != 32);
            i = d;
            return
        }

        function sc(a, f, g, h, j, k, l, m, n, o) {
            a = a | 0;
            f = f | 0;
            g = g | 0;
            h = h | 0;
            j = j | 0;
            k = k | 0;
            l = l | 0;
            m = m | 0;
            n = n | 0;
            o = o | 0;
            var p = 0,
                q = 0,
                r = 0,
                s = 0,
                t = 0;
            p = i;
            i = i + 128 | 0;
            k = p;
            r = k + 0 | 0;
            q = r + 128 | 0;
            do {
                c[r >> 2] = 0;
                r = r + 4 | 0
            } while ((r | 0) < (q | 0));
            t = d[j + n + 96 >> 0] | 0;
            g = g >>> 1;
            c[k + ((t & 31) << 2) >> 2] = b[j + (n * 10 | 0) + 114 >> 1];
            c[k + ((t + 1 & 31) << 2) >> 2] = b[j + (n * 10 | 0) + 116 >> 1];
            c[k + ((t + 2 & 31) << 2) >> 2] = b[j + (n * 10 | 0) + 118 >> 1];
            c[k + ((t + 3 & 31) << 2) >> 2] = b[j + (n * 10 | 0) + 120 >> 1];
            j = o + -5 | 0;
            h = h >>> 1;
            if ((m | 0) <= 0) {
                i = p;
                return
            }
            n = (l | 0) > 0;
            o = 1 << o;
            q = 0 - o | 0;
            o = o + -1 | 0;
            r = 0;
            while (1) {
                if (n) {
                    s = 0;
                    do {
                        t = e[f + (s << 1) >> 1] | 0;
                        t = t + (c[k + (t >>> j << 2) >> 2] | 0) | 0;
                        if (t & q) t = 0 - t >> 31 & o;
                        b[a + (s << 1) >> 1] = t;
                        s = s + 1 | 0
                    } while ((s | 0) != (l | 0))
                }
                r = r + 1 | 0;
                if ((r | 0) == (m | 0)) break;
                else {
                    a = a + (g << 1) | 0;
                    f = f + (h << 1) | 0
                }
            }
            i = p;
            return
        }

        function tc(a, d, f, g, h, j, k, l, m, n, o, p, q) {
            a = a | 0;
            d = d | 0;
            f = f | 0;
            g = g | 0;
            h = h | 0;
            j = j | 0;
            k = k | 0;
            l = l | 0;
            m = m | 0;
            n = n | 0;
            o = o | 0;
            p = p | 0;
            q = q | 0;
            var r = 0,
                s = 0,
                t = 0,
                u = 0,
                v = 0,
                w = 0;
            n = i;
            o = h + (m * 10 | 0) + 112 | 0;
            r = c[h + (m << 2) + 100 >> 2] | 0;
            f = f >>> 1;
            g = g >>> 1;
            if ((r | 0) != 1) {
                if (c[j >> 2] | 0) {
                    u = b[o >> 1] | 0;
                    if ((l | 0) > 0) {
                        p = 1 << q;
                        t = 0 - p | 0;
                        p = p + -1 | 0;
                        s = 0;
                        do {
                            v = (e[d + (($(s, g) | 0) << 1) >> 1] | 0) + u | 0;
                            if (v & t) v = 0 - v >> 31 & p;
                            b[a + (($(s, f) | 0) << 1) >> 1] = v;
                            s = s + 1 | 0
                        } while ((s | 0) != (l | 0));
                        p = 1
                    } else p = 1
                } else p = 0;
                if (c[j + 8 >> 2] | 0) {
                    s = b[o >> 1] | 0;
                    k = k + -1 | 0;
                    if ((l | 0) > 0) {
                        v = 1 << q;
                        u = 0 - v | 0;
                        v = v + -1 | 0;
                        t = 0;
                        do {
                            w = (e[d + (($(t, g) | 0) + k << 1) >> 1] | 0) + s | 0;
                            if (w & u) w = 0 - w >> 31 & v;
                            b[a + (($(t, f) | 0) + k << 1) >> 1] = w;
                            t = t + 1 | 0
                        } while ((t | 0) != (l | 0))
                    }
                }
                if (!r) {
                    u = l;
                    v = p;
                    w = 0;
                    t = k;
                    Bc(a, d, f, g, h, t, u, m, v, w, q);
                    i = n;
                    return
                }
            } else p = 0;
            if (c[j + 4 >> 2] | 0) {
                r = b[o >> 1] | 0;
                if ((p | 0) < (k | 0)) {
                    s = 1 << q;
                    t = 0 - s | 0;
                    s = s + -1 | 0;
                    u = p;
                    do {
                        v = (e[d + (u << 1) >> 1] | 0) + r | 0;
                        if (v & t) v = 0 - v >> 31 & s;
                        b[a + (u << 1) >> 1] = v;
                        u = u + 1 | 0
                    } while ((u | 0) != (k | 0));
                    r = 1
                } else r = 1
            } else r = 0;
            if (!(c[j + 12 >> 2] | 0)) {
                u = l;
                v = p;
                w = r;
                t = k;
                Bc(a, d, f, g, h, t, u, m, v, w, q);
                i = n;
                return
            }
            j = b[o >> 1] | 0;
            t = l + -1 | 0;
            o = $(t, f) | 0;
            u = $(t, g) | 0;
            if ((p | 0) >= (k | 0)) {
                u = t;
                v = p;
                w = r;
                t = k;
                Bc(a, d, f, g, h, t, u, m, v, w, q);
                i = n;
                return
            }
            s = 1 << q;
            l = 0 - s | 0;
            s = s + -1 | 0;
            v = p;
            do {
                w = (e[d + (v + u << 1) >> 1] | 0) + j | 0;
                if (w & l) w = 0 - w >> 31 & s;
                b[a + (v + o << 1) >> 1] = w;
                v = v + 1 | 0
            } while ((v | 0) != (k | 0));
            Bc(a, d, f, g, h, k, t, m, p, r, q);
            i = n;
            return
        }

        function uc(d, f, g, h, j, k, l, m, n, o, p, q, r) {
            d = d | 0;
            f = f | 0;
            g = g | 0;
            h = h | 0;
            j = j | 0;
            k = k | 0;
            l = l | 0;
            m = m | 0;
            n = n | 0;
            o = o | 0;
            p = p | 0;
            q = q | 0;
            r = r | 0;
            var s = 0,
                t = 0,
                u = 0,
                v = 0,
                w = 0,
                x = 0,
                y = 0,
                z = 0,
                A = 0,
                B = 0,
                C = 0,
                D = 0,
                E = 0,
                F = 0,
                G = 0,
                H = 0,
                I = 0,
                J = 0,
                K = 0,
                L = 0;
            t = i;
            D = j + (n * 10 | 0) + 112 | 0;
            C = c[j + (n << 2) + 100 >> 2] | 0;
            g = g >>> 1;
            h = h >>> 1;
            B = (C | 0) != 1;
            if (B) {
                if (c[k >> 2] | 0) {
                    I = b[D >> 1] | 0;
                    if ((m | 0) > 0) {
                        H = 1 << r;
                        G = 0 - H | 0;
                        H = H + -1 | 0;
                        F = 0;
                        do {
                            J = (e[f + (($(F, h) | 0) << 1) >> 1] | 0) + I | 0;
                            if (J & G) J = 0 - J >> 31 & H;
                            b[d + (($(F, g) | 0) << 1) >> 1] = J;
                            F = F + 1 | 0
                        } while ((F | 0) != (m | 0));
                        F = 1
                    } else F = 1
                } else F = 0;
                if (c[k + 8 >> 2] | 0) {
                    G = b[D >> 1] | 0;
                    l = l + -1 | 0;
                    if ((m | 0) > 0) {
                        J = 1 << r;
                        I = 0 - J | 0;
                        J = J + -1 | 0;
                        H = 0;
                        do {
                            K = (e[f + (($(H, h) | 0) + l << 1) >> 1] | 0) + G | 0;
                            if (K & I) K = 0 - K >> 31 & J;
                            b[d + (($(H, g) | 0) + l << 1) >> 1] = K;
                            H = H + 1 | 0
                        } while ((H | 0) != (m | 0))
                    }
                }
                if (!C) {
                    D = 1;
                    G = 0
                } else E = 15
            } else {
                F = 0;
                E = 15
            }
            if ((E | 0) == 15) {
                if (c[k + 4 >> 2] | 0) {
                    H = b[D >> 1] | 0;
                    if ((F | 0) < (l | 0)) {
                        I = 1 << r;
                        G = 0 - I | 0;
                        I = I + -1 | 0;
                        E = F;
                        do {
                            J = (e[f + (E << 1) >> 1] | 0) + H | 0;
                            if (J & G) J = 0 - J >> 31 & I;
                            b[d + (E << 1) >> 1] = J;
                            E = E + 1 | 0
                        } while ((E | 0) != (l | 0));
                        G = 1
                    } else G = 1
                } else G = 0;
                if (c[k + 12 >> 2] | 0) {
                    D = b[D >> 1] | 0;
                    m = m + -1 | 0;
                    I = $(m, g) | 0;
                    H = $(m, h) | 0;
                    if ((F | 0) < (l | 0)) {
                        K = 1 << r;
                        J = 0 - K | 0;
                        K = K + -1 | 0;
                        E = F;
                        do {
                            L = (e[f + (E + H << 1) >> 1] | 0) + D | 0;
                            if (L & J) L = 0 - L >> 31 & K;
                            b[d + (E + I << 1) >> 1] = L;
                            E = E + 1 | 0
                        } while ((E | 0) != (l | 0));
                        D = 0
                    } else D = 0
                } else D = 0
            }
            Bc(d, f, g, h, j, l, m, n, F, G, r);
            r = (C | 0) == 2;
            if ((a[q >> 0] | 0) == 0 & r ? (c[k >> 2] | 0) == 0 : 0) j = (c[k + 4 >> 2] | 0) == 0;
            else j = 0;
            H = j & 1;
            j = q + 1 | 0;
            C = (C | 0) == 3;
            if ((a[j >> 0] | 0) == 0 & C ? (c[k + 4 >> 2] | 0) == 0 : 0) n = (c[k + 8 >> 2] | 0) == 0;
            else n = 0;
            I = n & 1;
            n = q + 2 | 0;
            if ((a[n >> 0] | 0) == 0 & r ? (c[k + 8 >> 2] | 0) == 0 : 0) E = (c[k + 12 >> 2] | 0) == 0;
            else E = 0;
            J = E & 1;
            E = q + 3 | 0;
            if ((a[E >> 0] | 0) == 0 & C ? (c[k >> 2] | 0) == 0 : 0) k = (c[k + 12 >> 2] | 0) == 0;
            else k = 0;
            k = k & 1;
            B = B ^ 1;
            if (!((a[o >> 0] | 0) == 0 | B) ? (A = H + G | 0, z = m - k | 0, (A | 0) < (z | 0)) : 0)
                do {
                    b[d + (($(A, g) | 0) << 1) >> 1] = b[f + (($(A, h) | 0) << 1) >> 1] | 0;
                    A = A + 1 | 0
                } while ((A | 0) != (z | 0));
            if (!((a[o + 1 >> 0] | 0) == 0 | B) ? (y = I + G | 0, x = m - J | 0, (y | 0) < (x | 0)) : 0) {
                z = l + -1 | 0;
                do {
                    b[d + (z + ($(y, g) | 0) << 1) >> 1] = b[f + (z + ($(y, h) | 0) << 1) >> 1] | 0;
                    y = y + 1 | 0
                } while ((y | 0) != (x | 0))
            }
            if (!((a[p >> 0] | 0) == 0 | D) ? (w = H + F | 0, v = l - I | 0, (w | 0) < (v | 0)) : 0)
                do {
                    b[d + (w << 1) >> 1] = b[f + (w << 1) >> 1] | 0;
                    w = w + 1 | 0
                } while ((w | 0) != (v | 0));
            if (!((a[p + 1 >> 0] | 0) == 0 | D) ? (u = k + F | 0, s = l - J | 0, (u | 0) < (s | 0)) : 0) {
                v = m + -1 | 0;
                p = $(v, h) | 0;
                v = $(v, g) | 0;
                do {
                    b[d + (u + v << 1) >> 1] = b[f + (u + p << 1) >> 1] | 0;
                    u = u + 1 | 0
                } while ((u | 0) != (s | 0))
            }
            if ((a[q >> 0] | 0) != 0 & r) b[d >> 1] = b[f >> 1] | 0;
            if ((a[j >> 0] | 0) != 0 & C) {
                L = l + -1 | 0;
                b[d + (L << 1) >> 1] = b[f + (L << 1) >> 1] | 0
            }
            if ((a[n >> 0] | 0) != 0 & r) {
                L = m + -1 | 0;
                K = l + -1 | 0;
                b[d + (K + ($(L, g) | 0) << 1) >> 1] = b[f + (K + ($(L, h) | 0) << 1) >> 1] | 0
            }
            if (!((a[E >> 0] | 0) != 0 & C)) {
                i = t;
                return
            }
            L = m + -1 | 0;
            b[d + (($(L, g) | 0) << 1) >> 1] = b[f + (($(L, h) | 0) << 1) >> 1] | 0;
            i = t;
            return
        }

        function vc(a, b, c, d, e, f, g) {
            a = a | 0;
            b = b | 0;
            c = c | 0;
            d = d | 0;
            e = e | 0;
            f = f | 0;
            g = g | 0;
            var h = 0;
            h = i;
            Ac(a, b, 2, c, d, e, f, g);
            i = h;
            return
        }

        function wc(a, b, c, d, e, f, g) {
            a = a | 0;
            b = b | 0;
            c = c | 0;
            d = d | 0;
            e = e | 0;
            f = f | 0;
            g = g | 0;
            var h = 0;
            h = i;
            Ac(a, 2, b, c, d, e, f, g);
            i = h;
            return
        }

        function xc(a, b, c, d, e, f) {
            a = a | 0;
            b = b | 0;
            c = c | 0;
            d = d | 0;
            e = e | 0;
            f = f | 0;
            var g = 0;
            g = i;
            zc(a, b, 2, c, d, e, f);
            i = g;
            return
        }

        function yc(a, b, c, d, e, f) {
            a = a | 0;
            b = b | 0;
            c = c | 0;
            d = d | 0;
            e = e | 0;
            f = f | 0;
            var g = 0;
            g = i;
            zc(a, 2, b, c, d, e, f);
            i = g;
            return
        }

        function zc(d, f, g, h, j, k, l) {
            d = d | 0;
            f = f | 0;
            g = g | 0;
            h = h | 0;
            j = j | 0;
            k = k | 0;
            l = l | 0;
            var m = 0,
                n = 0,
                o = 0,
                p = 0,
                q = 0,
                r = 0,
                s = 0,
                t = 0,
                u = 0,
                v = 0,
                w = 0,
                x = 0,
                y = 0,
                z = 0,
                A = 0,
                B = 0;
            m = i;
            f = f >>> 1;
            p = g >>> 1;
            o = l + -8 | 0;
            g = $(f, -2) | 0;
            n = 0 - f | 0;
            r = 1 << l;
            q = 0 - r | 0;
            r = r + -1 | 0;
            l = 0;
            while (1) {
                s = c[h + (l << 2) >> 2] << o;
                if ((s | 0) >= 1) {
                    v = 0 - s | 0;
                    u = (a[j + l >> 0] | 0) == 0;
                    t = (a[k + l >> 0] | 0) == 0;
                    x = 0;
                    w = d;
                    while (1) {
                        y = w + (n << 1) | 0;
                        B = e[y >> 1] | 0;
                        z = e[w >> 1] | 0;
                        A = (e[w + (g << 1) >> 1] | 0) + 4 - (e[w + (f << 1) >> 1] | 0) + (z - B << 2) >> 3;
                        if ((A | 0) < (v | 0)) A = v;
                        else A = (A | 0) > (s | 0) ? s : A;
                        if (u) {
                            B = A + B | 0;
                            if (B & q) B = 0 - B >> 31 & r;
                            b[y >> 1] = B
                        }
                        if (t) {
                            y = z - A | 0;
                            if (y & q) y = 0 - y >> 31 & r;
                            b[w >> 1] = y
                        }
                        x = x + 1 | 0;
                        if ((x | 0) == 4) break;
                        else w = w + (p << 1) | 0
                    }
                }
                l = l + 1 | 0;
                if ((l | 0) == 2) break;
                else d = d + (p << 2 << 1) | 0
            }
            i = m;
            return
        }

        function Ac(d, f, g, h, j, k, l, m) {
            d = d | 0;
            f = f | 0;
            g = g | 0;
            h = h | 0;
            j = j | 0;
            k = k | 0;
            l = l | 0;
            m = m | 0;
            var n = 0,
                o = 0,
                p = 0,
                q = 0,
                r = 0,
                s = 0,
                t = 0,
                u = 0,
                v = 0,
                w = 0,
                x = 0,
                y = 0,
                z = 0,
                A = 0,
                B = 0,
                C = 0,
                D = 0,
                E = 0,
                F = 0,
                G = 0,
                H = 0,
                I = 0,
                J = 0,
                K = 0,
                L = 0,
                M = 0,
                N = 0,
                O = 0,
                P = 0,
                Q = 0,
                R = 0,
                S = 0,
                T = 0,
                U = 0,
                V = 0,
                W = 0,
                X = 0,
                Y = 0,
                Z = 0,
                _ = 0,
                aa = 0,
                ba = 0,
                ca = 0,
                da = 0,
                ea = 0,
                fa = 0;
            n = i;
            f = f >>> 1;
            g = g >>> 1;
            o = m + -8 | 0;
            y = h << o;
            r = $(f, -3) | 0;
            s = $(f, -2) | 0;
            w = 0 - f | 0;
            h = f << 1;
            C = g * 3 | 0;
            A = C + r | 0;
            B = C + s | 0;
            z = C - f | 0;
            D = C + h | 0;
            E = C + f | 0;
            x = y >> 3;
            u = y >> 2;
            q = $(f, -4) | 0;
            p = f * 3 | 0;
            v = C + q | 0;
            F = (g + f | 0) * 3 | 0;
            t = (y >> 1) + y >> 3;
            H = 1 << m;
            G = 0 - H | 0;
            H = H + -1 | 0;
            m = g << 2;
            J = g << 2;
            I = 0;
            do {
                Y = b[d + (r << 1) >> 1] | 0;
                X = b[d + (s << 1) >> 1] | 0;
                W = b[d + (w << 1) >> 1] | 0;
                da = W & 65535;
                R = (Y & 65535) - ((X & 65535) << 1) + da | 0;
                R = (R | 0) > -1 ? R : 0 - R | 0;
                T = b[d + (h << 1) >> 1] | 0;
                U = b[d + (f << 1) >> 1] | 0;
                V = b[d >> 1] | 0;
                M = V & 65535;
                S = (T & 65535) - ((U & 65535) << 1) + M | 0;
                S = (S | 0) > -1 ? S : 0 - S | 0;
                ba = e[d + (z << 1) >> 1] | 0;
                Q = (e[d + (A << 1) >> 1] | 0) - ((e[d + (B << 1) >> 1] | 0) << 1) + ba | 0;
                Q = (Q | 0) > -1 ? Q : 0 - Q | 0;
                ca = e[d + (C << 1) >> 1] | 0;
                Z = (e[d + (D << 1) >> 1] | 0) - ((e[d + (E << 1) >> 1] | 0) << 1) + ca | 0;
                Z = (Z | 0) > -1 ? Z : 0 - Z | 0;
                L = S + R | 0;
                aa = Z + Q | 0;
                K = c[j + (I << 2) >> 2] << o;
                _ = a[k + I >> 0] | 0;
                P = a[l + I >> 0] | 0;
                do
                    if ((aa + L | 0) < (y | 0)) {
                        N = (K * 5 | 0) + 1 >> 1;
                        ea = (e[d + (q << 1) >> 1] | 0) - da | 0;
                        O = b[d + (p << 1) >> 1] | 0;
                        fa = (O & 65535) - M | 0;
                        if ((((((((fa | 0) > -1 ? fa : 0 - fa | 0) + ((ea | 0) > -1 ? ea : 0 - ea | 0) | 0) < (x | 0) ? (fa = da - M | 0, (((fa | 0) > -1 ? fa : 0 - fa | 0) | 0) < (N | 0)) : 0) ? (fa = (e[d + (v << 1) >> 1] | 0) - ba | 0, ea = (e[d + (F << 1) >> 1] | 0) - ca | 0, (((ea | 0) > -1 ? ea : 0 - ea | 0) + ((fa | 0) > -1 ? fa : 0 - fa | 0) | 0) < (x | 0)) : 0) ? (fa = ba - ca | 0, (((fa | 0) > -1 ? fa : 0 - fa | 0) | 0) < (N | 0)) : 0) ? (L << 1 | 0) < (u | 0) : 0) ? (aa << 1 | 0) < (u | 0) : 0) {
                            K = K << 1;
                            L = _ << 24 >> 24 == 0;
                            M = 0 - K | 0;
                            N = P << 24 >> 24 == 0;
                            ba = O;
                            P = 1;
                            O = d;
                            while (1) {
                                Z = O + (r << 1) | 0;
                                Y = Y & 65535;
                                _ = O + (s << 1) | 0;
                                X = X & 65535;
                                aa = O + (w << 1) | 0;
                                R = W & 65535;
                                V = V & 65535;
                                W = O + (f << 1) | 0;
                                U = U & 65535;
                                Q = O + (h << 1) | 0;
                                S = T & 65535;
                                T = ba & 65535;
                                if (L) {
                                    ba = e[O + (q << 1) >> 1] | 0;
                                    ca = (Y + 4 + U + (R + X + V << 1) >> 3) - R | 0;
                                    if ((ca | 0) < (M | 0)) ca = M;
                                    else ca = (ca | 0) > (K | 0) ? K : ca;
                                    b[aa >> 1] = ca + R;
                                    aa = ((Y + 2 + X + R + V | 0) >>> 2) - X | 0;
                                    if ((aa | 0) < (M | 0)) aa = M;
                                    else aa = (aa | 0) > (K | 0) ? K : aa;
                                    b[_ >> 1] = aa + X;
                                    _ = ((Y * 3 | 0) + 4 + X + R + V + (ba << 1) >> 3) - Y | 0;
                                    if ((_ | 0) < (M | 0)) _ = M;
                                    else _ = (_ | 0) > (K | 0) ? K : _;
                                    b[Z >> 1] = _ + Y
                                }
                                if (N) {
                                    X = (X + 4 + S + (V + R + U << 1) >> 3) - V | 0;
                                    if ((X | 0) < (M | 0)) X = M;
                                    else X = (X | 0) > (K | 0) ? K : X;
                                    b[O >> 1] = X + V;
                                    X = ((R + 2 + V + U + S | 0) >>> 2) - U | 0;
                                    if ((X | 0) < (M | 0)) X = M;
                                    else X = (X | 0) > (K | 0) ? K : X;
                                    b[W >> 1] = X + U;
                                    R = (R + 4 + V + U + (S * 3 | 0) + (T << 1) >> 3) - S | 0;
                                    if ((R | 0) < (M | 0)) R = M;
                                    else R = (R | 0) > (K | 0) ? K : R;
                                    b[Q >> 1] = R + S
                                }
                                Q = O + (g << 1) | 0;
                                if ((P | 0) == 4) break;
                                Y = b[O + (g + r << 1) >> 1] | 0;
                                X = b[O + (g + s << 1) >> 1] | 0;
                                W = b[O + (g - f << 1) >> 1] | 0;
                                V = b[Q >> 1] | 0;
                                U = b[O + (g + f << 1) >> 1] | 0;
                                T = b[O + (g + h << 1) >> 1] | 0;
                                ba = b[O + (g + p << 1) >> 1] | 0;
                                P = P + 1 | 0;
                                O = Q
                            }
                            d = d + (J << 1) | 0;
                            break
                        }
                        L = K >> 1;
                        N = K * 10 | 0;
                        M = 0 - K | 0;
                        O = _ << 24 >> 24 != 0;
                        P = P << 24 >> 24 != 0;
                        Q = (Q + R | 0) < (t | 0) & (O ^ 1);
                        R = 0 - L | 0;
                        S = (Z + S | 0) < (t | 0) & (P ^ 1);
                        _ = V;
                        ba = U;
                        U = 1;
                        V = d;
                        while (1) {
                            aa = Y & 65535;
                            Y = V + (s << 1) | 0;
                            Z = X & 65535;
                            da = V + (w << 1) | 0;
                            ca = W & 65535;
                            _ = _ & 65535;
                            W = V + (f << 1) | 0;
                            X = ba & 65535;
                            T = T & 65535;
                            ba = ((_ - ca | 0) * 9 | 0) + 8 + ($(X - Z | 0, -3) | 0) >> 4;
                            if ((((ba | 0) > -1 ? ba : 0 - ba | 0) | 0) < (N | 0)) {
                                if ((ba | 0) < (M | 0)) ba = M;
                                else ba = (ba | 0) > (K | 0) ? K : ba;
                                if (!O) {
                                    ea = ba + ca | 0;
                                    if (ea & G) ea = 0 - ea >> 31 & H;
                                    b[da >> 1] = ea
                                }
                                if (!P) {
                                    da = _ - ba | 0;
                                    if (da & G) da = 0 - da >> 31 & H;
                                    b[V >> 1] = da
                                }
                                if (Q) {
                                    aa = ((aa + 1 + ca | 0) >>> 1) - Z + ba >> 1;
                                    if ((aa | 0) < (R | 0)) aa = R;
                                    else aa = (aa | 0) > (L | 0) ? L : aa;
                                    Z = aa + Z | 0;
                                    if (Z & G) Z = 0 - Z >> 31 & H;
                                    b[Y >> 1] = Z
                                }
                                if (S) {
                                    T = ((_ + 1 + T | 0) >>> 1) - X - ba >> 1;
                                    if ((T | 0) < (R | 0)) T = R;
                                    else T = (T | 0) > (L | 0) ? L : T;
                                    T = T + X | 0;
                                    if (T & G) T = 0 - T >> 31 & H;
                                    b[W >> 1] = T
                                }
                            }
                            Z = V + (g << 1) | 0;
                            if ((U | 0) == 4) break;
                            Y = b[V + (g + r << 1) >> 1] | 0;
                            X = b[V + (g + s << 1) >> 1] | 0;
                            W = b[V + (g - f << 1) >> 1] | 0;
                            _ = b[Z >> 1] | 0;
                            ba = b[V + (g + f << 1) >> 1] | 0;
                            T = b[V + (g + h << 1) >> 1] | 0;
                            U = U + 1 | 0;
                            V = Z
                        }
                        d = d + (J << 1) | 0
                    } else d = d + (m << 1) | 0;
                while (0);
                I = I + 1 | 0
            } while ((I | 0) != 2);
            i = n;
            return
        }

        function Bc(e, f, g, h, j, k, l, m, n, o, p) {
            e = e | 0;
            f = f | 0;
            g = g | 0;
            h = h | 0;
            j = j | 0;
            k = k | 0;
            l = l | 0;
            m = m | 0;
            n = n | 0;
            o = o | 0;
            p = p | 0;
            var q = 0,
                r = 0,
                s = 0,
                t = 0,
                u = 0,
                v = 0,
                w = 0,
                x = 0,
                y = 0,
                z = 0,
                A = 0,
                B = 0,
                C = 0,
                D = 0,
                E = 0;
            t = i;
            x = c[j + (m << 2) + 100 >> 2] | 0;
            r = a[2728 + (x << 2) >> 0] | 0;
            q = a[2730 + (x << 2) >> 0] | 0;
            if ((o | 0) >= (l | 0)) {
                i = t;
                return
            }
            s = (n | 0) < (k | 0);
            v = 1 << p;
            u = 0 - v | 0;
            v = v + -1 | 0;
            w = o;
            p = $((a[2729 + (x << 2) >> 0] | 0) + o | 0, h) | 0;
            y = $((a[2731 + (x << 2) >> 0] | 0) + o | 0, h) | 0;
            x = $(o, g) | 0;
            z = $(o, h) | 0;
            while (1) {
                if (s) {
                    o = p + r | 0;
                    A = y + q | 0;
                    B = n;
                    do {
                        C = b[f + (B + z << 1) >> 1] | 0;
                        D = b[f + (o + B << 1) >> 1] | 0;
                        if ((C & 65535) > (D & 65535)) D = 3;
                        else D = ((C << 16 >> 16 != D << 16 >> 16) << 31 >> 31) + 2 | 0;
                        E = b[f + (A + B << 1) >> 1] | 0;
                        if ((C & 65535) > (E & 65535)) E = 1;
                        else E = (C << 16 >> 16 != E << 16 >> 16) << 31 >> 31;
                        C = (b[j + (m * 10 | 0) + (d[2720 + (E + D) >> 0] << 1) + 112 >> 1] | 0) + (C & 65535) | 0;
                        if (C & u) C = 0 - C >> 31 & v;
                        b[e + (B + x << 1) >> 1] = C;
                        B = B + 1 | 0
                    } while ((B | 0) != (k | 0))
                }
                w = w + 1 | 0;
                if ((w | 0) == (l | 0)) break;
                else {
                    p = p + h | 0;
                    y = y + h | 0;
                    x = x + g | 0;
                    z = z + h | 0
                }
            }
            i = t;
            return
        }

        function Cc(b, e, f, g, h) {
            b = b | 0;
            e = e | 0;
            f = f | 0;
            g = g | 0;
            h = h | 0;
            var j = 0,
                k = 0,
                l = 0,
                m = 0,
                n = 0,
                o = 0,
                p = 0,
                q = 0,
                r = 0;
            j = i;
            k = c[b + 136 >> 2] | 0;
            l = (c[b + 200 >> 2] | 0) + 13080 | 0;
            r = (1 << c[l >> 2]) + -1 | 0;
            o = r & e;
            n = r & f;
            q = (n | 0) != 0 | (a[k + 309 >> 0] | 0) != 0;
            m = q & 1;
            c[k + 31296 >> 2] = m;
            p = (o | 0) != 0 | (a[k + 308 >> 0] | 0) != 0;
            b = p & 1;
            c[k + 31292 >> 2] = b;
            if (!(r & (f | e))) p = d[k + 311 >> 0] | 0;
            else p = p & q & 1;
            c[k + 31300 >> 2] = p;
            if ((o + g | 0) == (1 << c[l >> 2] | 0)) m = (a[k + 310 >> 0] | 0) != 0 & (n | 0) == 0 & 1;
            c[k + 31308 >> 2] = m;
            if (!m) {
                q = 0;
                q = q & 1;
                r = k + 31304 | 0;
                c[r >> 2] = q;
                r = h + f | 0;
                q = k + 316 | 0;
                q = c[q >> 2] | 0;
                q = (r | 0) < (q | 0);
                q = q ? b : 0;
                r = k + 31288 | 0;
                c[r >> 2] = q;
                i = j;
                return
            }
            q = (g + e | 0) < (c[k + 312 >> 2] | 0);
            q = q & 1;
            r = k + 31304 | 0;
            c[r >> 2] = q;
            r = h + f | 0;
            q = k + 316 | 0;
            q = c[q >> 2] | 0;
            q = (r | 0) < (q | 0);
            q = q ? b : 0;
            r = k + 31288 | 0;
            c[r >> 2] = q;
            i = j;
            return
        }

        function Dc(b) {
            b = b | 0;
            var e = 0,
                f = 0,
                g = 0,
                h = 0,
                j = 0,
                k = 0,
                l = 0,
                m = 0,
                n = 0,
                o = 0,
                p = 0,
                q = 0,
                r = 0,
                s = 0,
                t = 0,
                u = 0,
                v = 0,
                w = 0;
            f = i;
            i = i + 16 | 0;
            e = f;
            h = c[b + 136 >> 2] | 0;
            j = h + 204 | 0;
            k = td(13196) | 0;
            c[e >> 2] = k;
            if (!k) {
                u = -12;
                i = f;
                return u | 0
            }
            k = c[k + 4 >> 2] | 0;
            m = td(468) | 0;
            if (!m) {
                u = -12;
                i = f;
                return u | 0
            }
            l = c[m + 4 >> 2] | 0;
            c[l + 4 >> 2] = 1;
            o = l + 8 | 0;
            c[o >> 2] = 1;
            a[l >> 0] = 0;
            c[l + 348 >> 2] = 1;
            q = l + 352 | 0;
            n = l + 380 | 0;
            r = l + 408 | 0;
            p = 0;
            do {
                c[q + (p << 2) >> 2] = 1;
                c[n + (p << 2) >> 2] = 0;
                c[r + (p << 2) >> 2] = -1;
                p = p + 1 | 0
            } while ((p | 0) < (c[o >> 2] | 0));
            c[l + 436 >> 2] = 0;
            c[l + 440 >> 2] = 1;
            a[l + 444 >> 0] = 0;
            p = b + 208 | 0;
            vd(p);
            c[p >> 2] = m;
            c[k >> 2] = 0;
            p = k + 72 | 0;
            c[p >> 2] = 1;
            u = _c(j, 8) | 0;
            q = k + 4 | 0;
            c[q >> 2] = u;
            do
                if ((u | 0) <= 3) {
                    a[k + 8 >> 0] = 0;
                    o = k + 13120 | 0;
                    c[o >> 2] = cd(j, 32) | 0;
                    m = cd(j, 32) | 0;
                    n = k + 13124 | 0;
                    c[n >> 2] = m;
                    m = Qc(c[o >> 2] | 0, m, 0, c[b + 4 >> 2] | 0) | 0;
                    if ((m | 0) >= 0) {
                        l = k + 52 | 0;
                        c[l >> 2] = (_c(j, 8) | 0) + 8;
                        q = c[q >> 2] | 0;
                        if ((q | 0) == 1) {
                            c[k + 60 >> 2] = 54;
                            q = 54
                        } else if (!q) {
                            c[k + 60 >> 2] = 32;
                            q = 32
                        } else if ((q | 0) == 2) {
                            c[k + 60 >> 2] = 56;
                            q = 56
                        } else {
                            c[k + 60 >> 2] = 58;
                            q = 58
                        }
                        c[k + 56 >> 2] = 1;
                        q = Bd(q) | 0;
                        if (q) {
                            c[k + 13180 >> 2] = 0;
                            c[k + 13168 >> 2] = 0;
                            u = d[q + 5 >> 0] | 0;
                            c[k + 13172 >> 2] = u;
                            c[k + 13176 >> 2] = u;
                            u = d[q + 6 >> 0] | 0;
                            c[k + 13184 >> 2] = u;
                            c[k + 13188 >> 2] = u;
                            c[k + 64 >> 2] = 8;
                            if ((c[p >> 2] | 0) > 0) {
                                q = k + 76 | 0;
                                r = 0;
                                do {
                                    c[q + (r * 12 | 0) >> 2] = 1;
                                    c[q + (r * 12 | 0) + 4 >> 2] = 0;
                                    c[q + (r * 12 | 0) + 8 >> 2] = -1;
                                    r = r + 1 | 0
                                } while ((r | 0) < (c[p >> 2] | 0))
                            }
                            t = (dd(j) | 0) + 3 | 0;
                            u = k + 13064 | 0;
                            c[u >> 2] = t;
                            t = 1 << t;
                            s = t + -1 | 0;
                            t = 0 - t | 0;
                            c[o >> 2] = s + (c[o >> 2] | 0) & t;
                            c[n >> 2] = s + (c[n >> 2] | 0) & t;
                            t = k + 13068 | 0;
                            c[t >> 2] = dd(j) | 0;
                            s = k + 13072 | 0;
                            c[s >> 2] = (dd(j) | 0) + 2;
                            p = dd(j) | 0;
                            q = c[s >> 2] | 0;
                            r = k + 13076 | 0;
                            c[r >> 2] = q + p;
                            if (q >>> 0 < (c[u >> 2] | 0) >>> 0) {
                                v = dd(j) | 0;
                                p = k + 13092 | 0;
                                c[p >> 2] = v;
                                q = k + 13088 | 0;
                                c[q >> 2] = v;
                                a[k + 12940 >> 0] = 1;
                                a[k + 12941 >> 0] = bd(j) | 0;
                                v = bd(j) | 0;
                                c[k + 68 >> 2] = v;
                                if (v) {
                                    v = k + 13044 | 0;
                                    a[v >> 0] = (_c(j, 4) | 0) + 1;
                                    a[k + 13045 >> 0] = (_c(j, 4) | 0) + 1;
                                    w = (dd(j) | 0) + 3 | 0;
                                    c[k + 13048 >> 2] = w;
                                    c[k + 13052 >> 2] = w + (dd(j) | 0);
                                    if ((d[v >> 0] | 0 | 0) > (c[l >> 2] | 0)) {
                                        m = -1094995529;
                                        break
                                    }
                                    a[k + 13056 >> 0] = bd(j) | 0
                                }
                                c[k + 2184 >> 2] = 0;
                                a[k + 12942 >> 0] = 0;
                                a[k + 13060 >> 0] = 1;
                                a[k + 13061 >> 0] = bd(j) | 0;
                                c[k + 160 >> 2] = 0;
                                c[k + 164 >> 2] = 1;
                                if ((bd(j) | 0) != 0 ? (w = bd(j) | 0, ad(j, 7), (w | 0) != 0) : 0) {
                                    c[k + 13096 >> 2] = bd(j) | 0;
                                    c[k + 13100 >> 2] = bd(j) | 0;
                                    c[k + 13104 >> 2] = bd(j) | 0;
                                    c[k + 13108 >> 2] = bd(j) | 0;
                                    bd(j) | 0;
                                    c[k + 13112 >> 2] = bd(j) | 0;
                                    bd(j) | 0;
                                    c[k + 13116 >> 2] = bd(j) | 0;
                                    bd(j) | 0
                                }
                                j = c[o >> 2] | 0;
                                c[k + 12 >> 2] = j;
                                o = c[n >> 2] | 0;
                                c[k + 16 >> 2] = o;
                                u = c[u >> 2] | 0;
                                w = (c[t >> 2] | 0) + u | 0;
                                c[k + 13080 >> 2] = w;
                                t = u + -1 | 0;
                                c[k + 13084 >> 2] = t;
                                n = 1 << w;
                                v = j + -1 + n >> w;
                                c[k + 13128 >> 2] = v;
                                n = o + -1 + n >> w;
                                c[k + 13132 >> 2] = n;
                                c[k + 13136 >> 2] = $(n, v) | 0;
                                c[k + 13140 >> 2] = j >> u;
                                c[k + 13144 >> 2] = o >> u;
                                v = c[s >> 2] | 0;
                                c[k + 13148 >> 2] = j >> v;
                                c[k + 13152 >> 2] = o >> v;
                                c[k + 13156 >> 2] = j >> t;
                                c[k + 13160 >> 2] = o >> t;
                                v = w - v | 0;
                                c[k + 13164 >> 2] = (1 << v) + -1;
                                c[k + 13192 >> 2] = ((c[l >> 2] | 0) * 6 | 0) + -48;
                                u = (1 << u) + -1 | 0;
                                if ((((((u & j | 0) == 0 ? !((o & u | 0) != 0 | w >>> 0 > 6) : 0) ? (c[q >> 2] | 0) >>> 0 <= v >>> 0 : 0) ? (c[p >> 2] | 0) >>> 0 <= v >>> 0 : 0) ? (c[r >> 2] | 0) >>> 0 <= (w >>> 0 > 5 ? 5 : w) >>> 0 : 0) ? ((c[h + 216 >> 2] | 0) - (c[h + 212 >> 2] | 0) | 0) >= 0 : 0) {
                                    h = b + 272 | 0;
                                    j = c[h >> 2] | 0;
                                    if ((j | 0) != 0 ? (w = c[e >> 2] | 0, (Yd(c[j + 4 >> 2] | 0, c[w + 4 >> 2] | 0, c[w + 8 >> 2] | 0) | 0) == 0) : 0) {
                                        vd(e);
                                        w = 0;
                                        i = f;
                                        return w | 0
                                    } else j = 0;
                                    do {
                                        k = b + (j << 2) + 400 | 0;
                                        l = c[k >> 2] | 0;
                                        do
                                            if (l) {
                                                if (c[c[l + 4 >> 2] >> 2] | 0) break;
                                                vd(k)
                                            }
                                        while (0);
                                        j = j + 1 | 0
                                    } while ((j | 0) != 256);
                                    j = c[h >> 2] | 0;
                                    do
                                        if ((j | 0) != 0 ? (g = b + 200 | 0, (c[g >> 2] | 0) == (c[j + 4 >> 2] | 0)) : 0) {
                                            v = b + 1424 | 0;
                                            vd(v);
                                            w = ud(c[h >> 2] | 0) | 0;
                                            c[v >> 2] = w;
                                            if (w) break;
                                            c[g >> 2] = 0
                                        }
                                    while (0);
                                    vd(h);
                                    c[h >> 2] = c[e >> 2];
                                    w = 0;
                                    i = f;
                                    return w | 0
                                }
                            } else m = -1094995529
                        } else m = -22
                    }
                } else m = -1094995529;
            while (0);
            vd(e);
            w = m;
            i = f;
            return w | 0
        }

        function Ec(b) {
            b = b | 0;
            var e = 0,
                f = 0,
                g = 0,
                h = 0,
                j = 0,
                k = 0,
                l = 0,
                m = 0,
                n = 0,
                o = 0,
                p = 0,
                q = 0,
                r = 0,
                s = 0,
                t = 0,
                u = 0,
                v = 0,
                w = 0,
                x = 0,
                y = 0,
                z = 0,
                A = 0,
                B = 0,
                C = 0,
                E = 0,
                F = 0,
                G = 0,
                H = 0,
                I = 0;
            f = i;
            i = i + 16 | 0;
            e = f + 4 | 0;
            j = f;
            l = b + 136 | 0;
            g = c[l >> 2] | 0;
            n = g + 204 | 0;
            h = md(1692) | 0;
            c[j >> 2] = h;
            if (!h) {
                I = -12;
                i = f;
                return I | 0
            }
            I = qd(h, 1692, 6, 0, 0) | 0;
            c[e >> 2] = I;
            if (!I) {
                jd(j);
                I = -12;
                i = f;
                return I | 0
            }
            a[(c[j >> 2] | 0) + 53 >> 0] = 1;
            h = c[j >> 2] | 0;
            c[h + 44 >> 2] = 1;
            c[h + 48 >> 2] = 1;
            a[h + 52 >> 0] = 1;
            a[(c[j >> 2] | 0) + 57 >> 0] = 0;
            h = c[j >> 2] | 0;
            c[h + 60 >> 2] = 0;
            c[h + 64 >> 2] = 0;
            a[h + 1629 >> 0] = 2;
            h = dd(n) | 0;
            a: do
                if ((h >>> 0 <= 255 ? (k = dd(n) | 0, c[c[j >> 2] >> 2] = k, k >>> 0 <= 31) : 0) ? (m = c[b + (k << 2) + 272 >> 2] | 0, (m | 0) != 0) : 0) {
                    k = c[m + 4 >> 2] | 0;
                    I = (bd(n) | 0) & 255;
                    a[(c[j >> 2] | 0) + 41 >> 0] = I;
                    I = (bd(n) | 0) & 255;
                    a[(c[j >> 2] | 0) + 39 >> 0] = I;
                    I = _c(n, 3) | 0;
                    c[(c[j >> 2] | 0) + 1624 >> 2] = I;
                    I = (bd(n) | 0) & 255;
                    a[(c[j >> 2] | 0) + 4 >> 0] = I;
                    I = (bd(n) | 0) & 255;
                    a[(c[j >> 2] | 0) + 5 >> 0] = I;
                    I = (dd(n) | 0) + 1 | 0;
                    c[(c[j >> 2] | 0) + 8 >> 2] = I;
                    I = (dd(n) | 0) + 1 | 0;
                    c[(c[j >> 2] | 0) + 12 >> 2] = I;
                    I = ed(n) | 0;
                    c[(c[j >> 2] | 0) + 16 >> 2] = I;
                    I = (bd(n) | 0) & 255;
                    a[(c[j >> 2] | 0) + 20 >> 0] = I;
                    I = (bd(n) | 0) & 255;
                    a[(c[j >> 2] | 0) + 21 >> 0] = I;
                    I = (bd(n) | 0) & 255;
                    a[(c[j >> 2] | 0) + 22 >> 0] = I;
                    I = c[j >> 2] | 0;
                    c[I + 24 >> 2] = 0;
                    if (a[I + 22 >> 0] | 0) {
                        I = dd(n) | 0;
                        c[(c[j >> 2] | 0) + 24 >> 2] = I
                    }
                    I = ed(n) | 0;
                    c[(c[j >> 2] | 0) + 28 >> 2] = I;
                    if ((I + 12 | 0) >>> 0 <= 24 ? (I = ed(n) | 0, c[(c[j >> 2] | 0) + 32 >> 2] = I, (I + 12 | 0) >>> 0 <= 24) : 0) {
                        I = (bd(n) | 0) & 255;
                        a[(c[j >> 2] | 0) + 36 >> 0] = I;
                        I = (bd(n) | 0) & 255;
                        a[(c[j >> 2] | 0) + 37 >> 0] = I;
                        I = (bd(n) | 0) & 255;
                        a[(c[j >> 2] | 0) + 38 >> 0] = I;
                        I = (bd(n) | 0) & 255;
                        a[(c[j >> 2] | 0) + 40 >> 0] = I;
                        I = (bd(n) | 0) & 255;
                        a[(c[j >> 2] | 0) + 42 >> 0] = I;
                        I = (bd(n) | 0) & 255;
                        a[(c[j >> 2] | 0) + 43 >> 0] = I;
                        if (a[(c[j >> 2] | 0) + 42 >> 0] | 0) {
                            m = (dd(n) | 0) + 1 | 0;
                            c[(c[j >> 2] | 0) + 44 >> 2] = m;
                            m = (dd(n) | 0) + 1 | 0;
                            o = c[j >> 2] | 0;
                            c[o + 48 >> 2] = m;
                            o = c[o + 44 >> 2] | 0;
                            if (!o) {
                                b = -1094995529;
                                break
                            }
                            if ((m | 0) == 0 ? 1 : (o | 0) >= (c[k + 13120 >> 2] | 0)) {
                                b = -1094995529;
                                break
                            }
                            if ((m | 0) >= (c[k + 13124 >> 2] | 0)) {
                                b = -1094995529;
                                break
                            }
                            m = od(o, 4) | 0;
                            c[(c[j >> 2] | 0) + 1648 >> 2] = m;
                            m = od(c[(c[j >> 2] | 0) + 48 >> 2] | 0, 4) | 0;
                            c[(c[j >> 2] | 0) + 1652 >> 2] = m;
                            m = c[j >> 2] | 0;
                            if (!(c[m + 1648 >> 2] | 0)) {
                                b = -12;
                                break
                            }
                            if (!(c[m + 1652 >> 2] | 0)) {
                                b = -12;
                                break
                            }
                            p = (bd(n) | 0) & 255;
                            a[(c[j >> 2] | 0) + 52 >> 0] = p;
                            p = c[j >> 2] | 0;
                            if (!(a[p + 52 >> 0] | 0)) {
                                q = (c[p + 44 >> 2] | 0) + -1 | 0;
                                if ((q | 0) > 0) {
                                    o = 0;
                                    m = 0;
                                    r = 0;
                                    do {
                                        q = (dd(n) | 0) + 1 | 0;
                                        p = c[j >> 2] | 0;
                                        c[(c[p + 1648 >> 2] | 0) + (r << 2) >> 2] = q;
                                        o = ae(q | 0, 0, o | 0, m | 0) | 0;
                                        m = D;
                                        r = r + 1 | 0;
                                        q = (c[p + 44 >> 2] | 0) + -1 | 0
                                    } while ((r | 0) < (q | 0))
                                } else {
                                    m = 0;
                                    o = 0
                                }
                                r = c[k + 13128 >> 2] | 0;
                                s = ((r | 0) < 0) << 31 >> 31;
                                if (!(m >>> 0 < s >>> 0 | (m | 0) == (s | 0) & o >>> 0 < r >>> 0)) {
                                    b = -1094995529;
                                    break
                                }
                                I = $d(r | 0, s | 0, o | 0, m | 0) | 0;
                                c[(c[p + 1648 >> 2] | 0) + (q << 2) >> 2] = I;
                                q = (c[p + 48 >> 2] | 0) + -1 | 0;
                                if ((q | 0) > 0) {
                                    p = 0;
                                    o = 0;
                                    r = 0;
                                    do {
                                        q = (dd(n) | 0) + 1 | 0;
                                        m = c[j >> 2] | 0;
                                        c[(c[m + 1652 >> 2] | 0) + (r << 2) >> 2] = q;
                                        p = ae(q | 0, 0, p | 0, o | 0) | 0;
                                        o = D;
                                        r = r + 1 | 0;
                                        q = (c[m + 48 >> 2] | 0) + -1 | 0
                                    } while ((r | 0) < (q | 0))
                                } else {
                                    m = p;
                                    o = 0;
                                    p = 0
                                }
                                r = c[k + 13132 >> 2] | 0;
                                s = ((r | 0) < 0) << 31 >> 31;
                                if (!(o >>> 0 < s >>> 0 | (o | 0) == (s | 0) & p >>> 0 < r >>> 0)) {
                                    b = -1094995529;
                                    break
                                }
                                I = $d(r | 0, s | 0, p | 0, o | 0) | 0;
                                c[(c[m + 1652 >> 2] | 0) + (q << 2) >> 2] = I
                            }
                            I = (bd(n) | 0) & 255;
                            a[(c[j >> 2] | 0) + 53 >> 0] = I
                        }
                        I = (bd(n) | 0) & 255;
                        a[(c[j >> 2] | 0) + 54 >> 0] = I;
                        I = (bd(n) | 0) & 255;
                        a[(c[j >> 2] | 0) + 55 >> 0] = I;
                        if ((a[(c[j >> 2] | 0) + 55 >> 0] | 0) != 0 ? (I = (bd(n) | 0) & 255, a[(c[j >> 2] | 0) + 56 >> 0] = I, I = (bd(n) | 0) & 255, a[(c[j >> 2] | 0) + 57 >> 0] = I, (a[(c[j >> 2] | 0) + 57 >> 0] | 0) == 0) : 0) {
                            m = (ed(n) | 0) << 1;
                            c[(c[j >> 2] | 0) + 60 >> 2] = m;
                            m = (ed(n) | 0) << 1;
                            I = c[j >> 2] | 0;
                            c[I + 64 >> 2] = m;
                            if (((c[I + 60 >> 2] | 0) + 13 | 0) >>> 0 > 26) {
                                b = -1094995529;
                                break
                            }
                            if ((m + 13 | 0) >>> 0 > 26) {
                                b = -1094995529;
                                break
                            }
                        }
                        p = (bd(n) | 0) & 255;
                        a[(c[j >> 2] | 0) + 68 >> 0] = p;
                        p = c[j >> 2] | 0;
                        if (a[p + 68 >> 0] | 0) {
                            q = 0;
                            do {
                                o = p + (q << 6) + 69 | 0;
                                m = o + 16 | 0;
                                do {
                                    a[o >> 0] = 16;
                                    o = o + 1 | 0
                                } while ((o | 0) < (m | 0));
                                a[p + q + 1605 >> 0] = 16;
                                a[p + q + 1611 >> 0] = 16;
                                q = q + 1 | 0
                            } while ((q | 0) != 6);
                            o = p + 453 | 0;
                            q = 2744;
                            m = o + 64 | 0;
                            do {
                                a[o >> 0] = a[q >> 0] | 0;
                                o = o + 1 | 0;
                                q = q + 1 | 0
                            } while ((o | 0) < (m | 0));
                            o = p + 517 | 0;
                            q = 2744;
                            m = o + 64 | 0;
                            do {
                                a[o >> 0] = a[q >> 0] | 0;
                                o = o + 1 | 0;
                                q = q + 1 | 0
                            } while ((o | 0) < (m | 0));
                            o = p + 581 | 0;
                            q = 2744;
                            m = o + 64 | 0;
                            do {
                                a[o >> 0] = a[q >> 0] | 0;
                                o = o + 1 | 0;
                                q = q + 1 | 0
                            } while ((o | 0) < (m | 0));
                            o = p + 645 | 0;
                            q = 2808;
                            m = o + 64 | 0;
                            do {
                                a[o >> 0] = a[q >> 0] | 0;
                                o = o + 1 | 0;
                                q = q + 1 | 0
                            } while ((o | 0) < (m | 0));
                            o = p + 709 | 0;
                            q = 2808;
                            m = o + 64 | 0;
                            do {
                                a[o >> 0] = a[q >> 0] | 0;
                                o = o + 1 | 0;
                                q = q + 1 | 0
                            } while ((o | 0) < (m | 0));
                            o = p + 773 | 0;
                            q = 2808;
                            m = o + 64 | 0;
                            do {
                                a[o >> 0] = a[q >> 0] | 0;
                                o = o + 1 | 0;
                                q = q + 1 | 0
                            } while ((o | 0) < (m | 0));
                            o = p + 837 | 0;
                            q = 2744;
                            m = o + 64 | 0;
                            do {
                                a[o >> 0] = a[q >> 0] | 0;
                                o = o + 1 | 0;
                                q = q + 1 | 0
                            } while ((o | 0) < (m | 0));
                            o = p + 901 | 0;
                            q = 2744;
                            m = o + 64 | 0;
                            do {
                                a[o >> 0] = a[q >> 0] | 0;
                                o = o + 1 | 0;
                                q = q + 1 | 0
                            } while ((o | 0) < (m | 0));
                            o = p + 965 | 0;
                            q = 2744;
                            m = o + 64 | 0;
                            do {
                                a[o >> 0] = a[q >> 0] | 0;
                                o = o + 1 | 0;
                                q = q + 1 | 0
                            } while ((o | 0) < (m | 0));
                            o = p + 1029 | 0;
                            q = 2808;
                            m = o + 64 | 0;
                            do {
                                a[o >> 0] = a[q >> 0] | 0;
                                o = o + 1 | 0;
                                q = q + 1 | 0
                            } while ((o | 0) < (m | 0));
                            o = p + 1093 | 0;
                            q = 2808;
                            m = o + 64 | 0;
                            do {
                                a[o >> 0] = a[q >> 0] | 0;
                                o = o + 1 | 0;
                                q = q + 1 | 0
                            } while ((o | 0) < (m | 0));
                            o = p + 1157 | 0;
                            q = 2808;
                            m = o + 64 | 0;
                            do {
                                a[o >> 0] = a[q >> 0] | 0;
                                o = o + 1 | 0;
                                q = q + 1 | 0
                            } while ((o | 0) < (m | 0));
                            o = p + 1221 | 0;
                            q = 2744;
                            m = o + 64 | 0;
                            do {
                                a[o >> 0] = a[q >> 0] | 0;
                                o = o + 1 | 0;
                                q = q + 1 | 0
                            } while ((o | 0) < (m | 0));
                            o = p + 1285 | 0;
                            q = 2744;
                            m = o + 64 | 0;
                            do {
                                a[o >> 0] = a[q >> 0] | 0;
                                o = o + 1 | 0;
                                q = q + 1 | 0
                            } while ((o | 0) < (m | 0));
                            o = p + 1349 | 0;
                            q = 2744;
                            m = o + 64 | 0;
                            do {
                                a[o >> 0] = a[q >> 0] | 0;
                                o = o + 1 | 0;
                                q = q + 1 | 0
                            } while ((o | 0) < (m | 0));
                            o = p + 1413 | 0;
                            q = 2808;
                            m = o + 64 | 0;
                            do {
                                a[o >> 0] = a[q >> 0] | 0;
                                o = o + 1 | 0;
                                q = q + 1 | 0
                            } while ((o | 0) < (m | 0));
                            o = p + 1477 | 0;
                            q = 2808;
                            m = o + 64 | 0;
                            do {
                                a[o >> 0] = a[q >> 0] | 0;
                                o = o + 1 | 0;
                                q = q + 1 | 0
                            } while ((o | 0) < (m | 0));
                            o = p + 1541 | 0;
                            q = 2808;
                            m = o + 64 | 0;
                            do {
                                a[o >> 0] = a[q >> 0] | 0;
                                o = o + 1 | 0;
                                q = q + 1 | 0
                            } while ((o | 0) < (m | 0));
                            m = c[j >> 2] | 0;
                            v = (c[l >> 2] | 0) + 204 | 0;
                            w = 0;
                            do {
                                p = (w | 0) > 0 ? 64 : 16;
                                q = (w | 0) > 1;
                                o = w + -2 | 0;
                                x = (w | 0) == 3 ? 3 : 1;
                                r = 1 << (w << 1) + 4;
                                t = (r | 0) > 0;
                                s = (w | 0) == 0;
                                r = (r | 0) < 64 ? r : 64;
                                u = 0;
                                do {
                                    if (!(((bd(v) | 0) & 255) << 24 >> 24)) {
                                        y = dd(v) | 0;
                                        if (y) {
                                            if (u >>> 0 < y >>> 0) {
                                                b = -1094995529;
                                                break a
                                            }
                                            y = u - y | 0;
                                            fe(m + (w * 384 | 0) + (u << 6) + 69 | 0, m + (w * 384 | 0) + (y << 6) + 69 | 0, p | 0) | 0;
                                            if (q) a[m + (o * 6 | 0) + u + 1605 >> 0] = a[m + (o * 6 | 0) + y + 1605 >> 0] | 0
                                        }
                                    } else {
                                        if (q) {
                                            z = (ed(v) | 0) + 8 | 0;
                                            a[m + (o * 6 | 0) + u + 1605 >> 0] = z
                                        } else z = 8;
                                        if (t) {
                                            y = 0;
                                            do {
                                                if (s) A = (d[24 + y >> 0] << 2) + (d[8 + y >> 0] | 0) | 0;
                                                else A = (d[104 + y >> 0] << 3) + (d[40 + y >> 0] | 0) | 0;
                                                z = (z + 256 + (ed(v) | 0) | 0) % 256 | 0;
                                                a[m + (w * 384 | 0) + (u << 6) + A + 69 >> 0] = z;
                                                y = y + 1 | 0
                                            } while ((y | 0) != (r | 0))
                                        }
                                    }
                                    u = u + x | 0
                                } while ((u | 0) < 6);
                                w = w + 1 | 0
                            } while ((w | 0) < 4);
                            if ((c[k + 4 >> 2] | 0) == 3) {
                                o = 0;
                                do {
                                    a[m + o + 1285 >> 0] = a[m + o + 901 >> 0] | 0;
                                    a[m + o + 1349 >> 0] = a[m + o + 965 >> 0] | 0;
                                    a[m + o + 1477 >> 0] = a[m + o + 1093 >> 0] | 0;
                                    a[m + o + 1541 >> 0] = a[m + o + 1157 >> 0] | 0;
                                    o = o + 1 | 0
                                } while ((o | 0) != 64);
                                a[m + 1612 >> 0] = a[m + 1606 >> 0] | 0;
                                a[m + 1613 >> 0] = a[m + 1607 >> 0] | 0;
                                a[m + 1615 >> 0] = a[m + 1609 >> 0] | 0;
                                a[m + 1616 >> 0] = a[m + 1610 >> 0] | 0
                            }
                        }
                        I = (bd(n) | 0) & 255;
                        a[(c[j >> 2] | 0) + 1617 >> 0] = I;
                        I = (dd(n) | 0) + 2 | 0;
                        c[(c[j >> 2] | 0) + 1620 >> 2] = I;
                        m = k + 13080 | 0;
                        if (I >>> 0 <= (c[m >> 2] | 0) >>> 0) {
                            I = (bd(n) | 0) & 255;
                            a[(c[j >> 2] | 0) + 1628 >> 0] = I;
                            do
                                if ((bd(n) | 0) != 0 ? (I = bd(n) | 0, _c(n, 7) | 0, (I | 0) != 0) : 0) {
                                    n = c[j >> 2] | 0;
                                    p = (c[l >> 2] | 0) + 204 | 0;
                                    if (a[n + 21 >> 0] | 0) a[n + 1629 >> 0] = (dd(p) | 0) + 2;
                                    a[n + 1630 >> 0] = bd(p) | 0;
                                    I = (bd(p) | 0) & 255;
                                    a[n + 1631 >> 0] = I;
                                    if (I << 24 >> 24) {
                                        a[n + 1632 >> 0] = dd(p) | 0;
                                        I = dd(p) | 0;
                                        o = n + 1633 | 0;
                                        a[o >> 0] = I;
                                        if ((I & 255) >>> 0 < 5) l = 0;
                                        else break;
                                        while (1) {
                                            a[n + l + 1634 >> 0] = ed(p) | 0;
                                            a[n + l + 1639 >> 0] = ed(p) | 0;
                                            if ((l | 0) < (d[o >> 0] | 0)) l = l + 1 | 0;
                                            else break
                                        }
                                    }
                                    a[n + 1644 >> 0] = dd(p) | 0;
                                    a[n + 1645 >> 0] = dd(p) | 0
                                }
                            while (0);
                            l = od((c[(c[j >> 2] | 0) + 44 >> 2] | 0) + 1 | 0, 4) | 0;
                            c[(c[j >> 2] | 0) + 1656 >> 2] = l;
                            l = od((c[(c[j >> 2] | 0) + 48 >> 2] | 0) + 1 | 0, 4) | 0;
                            c[(c[j >> 2] | 0) + 1660 >> 2] = l;
                            l = k + 13128 | 0;
                            o = od(c[l >> 2] | 0, 4) | 0;
                            c[(c[j >> 2] | 0) + 1664 >> 2] = o;
                            o = c[j >> 2] | 0;
                            n = c[o + 1656 >> 2] | 0;
                            if (((n | 0) != 0 ? (c[o + 1660 >> 2] | 0) != 0 : 0) ? (c[o + 1664 >> 2] | 0) != 0 : 0) {
                                if (a[o + 52 >> 0] | 0) {
                                    p = c[o + 1648 >> 2] | 0;
                                    if (!p) {
                                        o = od(c[o + 44 >> 2] | 0, 4) | 0;
                                        c[(c[j >> 2] | 0) + 1648 >> 2] = o;
                                        o = od(c[(c[j >> 2] | 0) + 48 >> 2] | 0, 4) | 0;
                                        c[(c[j >> 2] | 0) + 1652 >> 2] = o;
                                        o = c[j >> 2] | 0;
                                        p = c[o + 1648 >> 2] | 0;
                                        if (!p) {
                                            b = -12;
                                            break
                                        }
                                    }
                                    n = c[o + 1652 >> 2] | 0;
                                    if (!n) {
                                        b = -12;
                                        break
                                    }
                                    q = o + 44 | 0;
                                    s = c[q >> 2] | 0;
                                    if ((s | 0) > 0) {
                                        r = 0;
                                        do {
                                            I = r;
                                            r = r + 1 | 0;
                                            H = c[l >> 2] | 0;
                                            c[p + (I << 2) >> 2] = (($(H, r) | 0) / (s | 0) | 0) - (($(H, I) | 0) / (s | 0) | 0);
                                            s = c[q >> 2] | 0
                                        } while ((r | 0) < (s | 0))
                                    }
                                    q = o + 48 | 0;
                                    s = c[q >> 2] | 0;
                                    if ((s | 0) > 0) {
                                        p = k + 13132 | 0;
                                        r = 0;
                                        do {
                                            I = r;
                                            r = r + 1 | 0;
                                            H = c[p >> 2] | 0;
                                            c[n + (I << 2) >> 2] = (($(H, r) | 0) / (s | 0) | 0) - (($(H, I) | 0) / (s | 0) | 0);
                                            s = c[q >> 2] | 0
                                        } while ((r | 0) < (s | 0))
                                    }
                                    n = c[o + 1656 >> 2] | 0
                                }
                                c[n >> 2] = 0;
                                q = o + 44 | 0;
                                if ((c[q >> 2] | 0) > 0) {
                                    p = c[o + 1648 >> 2] | 0;
                                    r = 0;
                                    s = 0;
                                    do {
                                        r = (c[p + (s << 2) >> 2] | 0) + r | 0;
                                        s = s + 1 | 0;
                                        c[n + (s << 2) >> 2] = r
                                    } while ((s | 0) < (c[q >> 2] | 0))
                                }
                                s = c[o + 1660 >> 2] | 0;
                                c[s >> 2] = 0;
                                r = o + 48 | 0;
                                if ((c[r >> 2] | 0) > 0) {
                                    q = c[o + 1652 >> 2] | 0;
                                    t = 0;
                                    p = 0;
                                    do {
                                        t = (c[q + (p << 2) >> 2] | 0) + t | 0;
                                        p = p + 1 | 0;
                                        c[s + (p << 2) >> 2] = t
                                    } while ((p | 0) < (c[r >> 2] | 0))
                                }
                                r = c[l >> 2] | 0;
                                if ((r | 0) > 0) {
                                    o = c[o + 1664 >> 2] | 0;
                                    p = 0;
                                    q = 0;
                                    do {
                                        q = (p >>> 0 > (c[n + (q << 2) >> 2] | 0) >>> 0 & 1) + q | 0;
                                        c[o + (p << 2) >> 2] = q;
                                        p = p + 1 | 0;
                                        r = c[l >> 2] | 0
                                    } while ((p | 0) < (r | 0))
                                }
                                x = $(c[k + 13132 >> 2] | 0, r) | 0;
                                n = od(x, 4) | 0;
                                c[(c[j >> 2] | 0) + 1668 >> 2] = n;
                                n = od(x, 4) | 0;
                                c[(c[j >> 2] | 0) + 1672 >> 2] = n;
                                n = od(x, 4) | 0;
                                c[(c[j >> 2] | 0) + 1676 >> 2] = n;
                                n = k + 13164 | 0;
                                q = (c[n >> 2] | 0) + 2 | 0;
                                q = od($(q, q) | 0, 4) | 0;
                                c[(c[j >> 2] | 0) + 1688 >> 2] = q;
                                q = c[j >> 2] | 0;
                                p = c[q + 1668 >> 2] | 0;
                                if (!p) {
                                    b = -12;
                                    break
                                }
                                w = c[q + 1672 >> 2] | 0;
                                if (!w) {
                                    b = -12;
                                    break
                                }
                                o = c[q + 1676 >> 2] | 0;
                                if (!o) {
                                    b = -12;
                                    break
                                }
                                if (!(c[q + 1688 >> 2] | 0)) {
                                    b = -12;
                                    break
                                }
                                if ((x | 0) > 0) {
                                    B = q + 44 | 0;
                                    r = q + 48 | 0;
                                    s = c[q + 1660 >> 2] | 0;
                                    v = c[q + 1648 >> 2] | 0;
                                    u = c[q + 1656 >> 2] | 0;
                                    t = q + 1652 | 0;
                                    A = 0;
                                    do {
                                        C = c[l >> 2] | 0;
                                        y = (A | 0) % (C | 0) | 0;
                                        z = (A | 0) / (C | 0) | 0;
                                        G = c[B >> 2] | 0;
                                        E = 0;
                                        while (1) {
                                            if ((E | 0) >= (G | 0)) {
                                                E = 0;
                                                break
                                            }
                                            F = E + 1 | 0;
                                            if (y >>> 0 < (c[u + (F << 2) >> 2] | 0) >>> 0) break;
                                            else E = F
                                        }
                                        H = c[r >> 2] | 0;
                                        F = 0;
                                        while (1) {
                                            if ((F | 0) >= (H | 0)) {
                                                F = 0;
                                                break
                                            }
                                            G = F + 1 | 0;
                                            if (z >>> 0 < (c[s + (G << 2) >> 2] | 0) >>> 0) break;
                                            else F = G
                                        }
                                        if ((E | 0) > 0) {
                                            G = c[(c[t >> 2] | 0) + (F << 2) >> 2] | 0;
                                            H = 0;
                                            I = 0;
                                            do {
                                                I = ($(c[v + (H << 2) >> 2] | 0, G) | 0) + I | 0;
                                                H = H + 1 | 0
                                            } while ((H | 0) != (E | 0))
                                        } else I = 0;
                                        if ((F | 0) > 0) {
                                            G = c[t >> 2] | 0;
                                            H = 0;
                                            do {
                                                I = ($(c[G + (H << 2) >> 2] | 0, C) | 0) + I | 0;
                                                H = H + 1 | 0
                                            } while ((H | 0) != (F | 0))
                                        }
                                        H = $(c[v + (E << 2) >> 2] | 0, z - (c[s + (F << 2) >> 2] | 0) | 0) | 0;
                                        I = I + y + H - (c[u + (E << 2) >> 2] | 0) | 0;
                                        c[p + (A << 2) >> 2] = I;
                                        c[w + (I << 2) >> 2] = A;
                                        A = A + 1 | 0
                                    } while ((A | 0) != (x | 0))
                                } else r = q + 48 | 0;
                                x = c[r >> 2] | 0;
                                if ((x | 0) > 0) {
                                    s = q + 44 | 0;
                                    t = q + 1660 | 0;
                                    q = q + 1656 | 0;
                                    z = c[s >> 2] | 0;
                                    u = 0;
                                    w = 0;
                                    while (1) {
                                        v = u;
                                        u = u + 1 | 0;
                                        if ((z | 0) > 0) {
                                            x = c[t >> 2] | 0;
                                            y = x + (u << 2) | 0;
                                            G = c[y >> 2] | 0;
                                            B = z;
                                            z = 0;
                                            do {
                                                E = c[x + (v << 2) >> 2] | 0;
                                                A = z;
                                                z = z + 1 | 0;
                                                if (E >>> 0 < G >>> 0) {
                                                    B = c[q >> 2] | 0;
                                                    C = B + (z << 2) | 0;
                                                    F = c[C >> 2] | 0;
                                                    do {
                                                        H = c[B + (A << 2) >> 2] | 0;
                                                        if (H >>> 0 < F >>> 0) {
                                                            do {
                                                                c[o + (c[p + (($(c[l >> 2] | 0, E) | 0) + H << 2) >> 2] << 2) >> 2] = w;
                                                                H = H + 1 | 0;
                                                                F = c[C >> 2] | 0
                                                            } while (H >>> 0 < F >>> 0);
                                                            G = c[y >> 2] | 0
                                                        }
                                                        E = E + 1 | 0
                                                    } while (E >>> 0 < G >>> 0);
                                                    B = c[s >> 2] | 0
                                                }
                                                w = w + 1 | 0
                                            } while ((z | 0) < (B | 0));
                                            v = c[r >> 2] | 0;
                                            z = B
                                        } else v = x;
                                        if ((u | 0) >= (v | 0)) break;
                                        else x = v
                                    }
                                } else w = 0;
                                o = od(w, 4) | 0;
                                c[(c[j >> 2] | 0) + 1680 >> 2] = o;
                                o = c[j >> 2] | 0;
                                p = c[o + 1680 >> 2] | 0;
                                if (!p) {
                                    b = -12;
                                    break
                                }
                                r = o + 48 | 0;
                                u = c[r >> 2] | 0;
                                if ((u | 0) > 0) {
                                    q = o + 44 | 0;
                                    t = c[q >> 2] | 0;
                                    s = 0;
                                    do {
                                        if ((t | 0) > 0) {
                                            u = c[o + 1660 >> 2] | 0;
                                            v = c[o + 1656 >> 2] | 0;
                                            w = 0;
                                            do {
                                                I = $(c[l >> 2] | 0, c[u + (s << 2) >> 2] | 0) | 0;
                                                c[p + (($(t, s) | 0) + w << 2) >> 2] = (c[v + (w << 2) >> 2] | 0) + I;
                                                w = w + 1 | 0;
                                                t = c[q >> 2] | 0
                                            } while ((w | 0) < (t | 0));
                                            u = c[r >> 2] | 0
                                        }
                                        s = s + 1 | 0
                                    } while ((s | 0) < (u | 0))
                                }
                                k = (c[m >> 2] | 0) - (c[k + 13072 >> 2] | 0) | 0;
                                v = c[n >> 2] | 0;
                                c[o + 1684 >> 2] = (c[o + 1688 >> 2] | 0) + (v + 3 << 2);
                                p = v + 2 | 0;
                                if ((p | 0) > 0) {
                                    m = c[(c[j >> 2] | 0) + 1688 >> 2] | 0;
                                    o = 0;
                                    do {
                                        c[m + (($(p, o) | 0) << 2) >> 2] = -1;
                                        c[m + (o << 2) >> 2] = -1;
                                        o = o + 1 | 0;
                                        v = c[n >> 2] | 0;
                                        p = v + 2 | 0
                                    } while ((o | 0) < (p | 0))
                                }
                                if ((v | 0) > -1) {
                                    m = c[j >> 2] | 0;
                                    j = m + 1668 | 0;
                                    p = k << 1;
                                    o = (k | 0) > 0;
                                    m = m + 1684 | 0;
                                    q = 0;
                                    while (1) {
                                        if ((v | 0) > -1) {
                                            r = q >> k;
                                            t = c[j >> 2] | 0;
                                            s = c[m >> 2] | 0;
                                            u = 0;
                                            while (1) {
                                                z = c[t + (($(c[l >> 2] | 0, r) | 0) + (u >> k) << 2) >> 2] << p;
                                                if (o) {
                                                    w = 0;
                                                    do {
                                                        y = 1 << w;
                                                        if (!(y & q)) x = 0;
                                                        else x = y << 1 << w;
                                                        z = ((y & u | 0) == 0 ? 0 : y << w) + z + x | 0;
                                                        w = w + 1 | 0
                                                    } while ((w | 0) != (k | 0))
                                                }
                                                c[s + (($(v + 2 | 0, q) | 0) + u << 2) >> 2] = z;
                                                v = c[n >> 2] | 0;
                                                if ((u | 0) < (v | 0)) u = u + 1 | 0;
                                                else break
                                            }
                                        }
                                        if ((q | 0) < (v | 0)) q = q + 1 | 0;
                                        else break
                                    }
                                }
                                if (((c[g + 216 >> 2] | 0) - (c[g + 212 >> 2] | 0) | 0) < 0) {
                                    b = 0;
                                    break
                                }
                                I = b + (h << 2) + 400 | 0;
                                vd(I);
                                c[I >> 2] = c[e >> 2];
                                I = 0;
                                i = f;
                                return I | 0
                            } else b = -12
                        } else b = -1094995529
                    } else b = -1094995529
                } else b = -1094995529;
            while (0);
            vd(e);
            I = b;
            i = f;
            return I | 0
        }

        function Fc(a, b) {
            a = a | 0;
            b = b | 0;
            var d = 0;
            a = i;
            i = i + 16 | 0;
            d = a;
            c[d >> 2] = b;
            jd(b + 1648 | 0);
            jd(b + 1652 | 0);
            jd(b + 1656 | 0);
            jd(b + 1660 | 0);
            jd(b + 1664 | 0);
            jd(b + 1668 | 0);
            jd(b + 1672 | 0);
            jd(b + 1680 | 0);
            jd(b + 1676 | 0);
            jd(b + 1688 | 0);
            jd(d);
            i = a;
            return
        }

        function Gc(a) {
            a = a | 0;
            var d = 0,
                e = 0,
                f = 0,
                g = 0,
                h = 0,
                j = 0,
                k = 0,
                l = 0;
            d = i;
            e = a + 136 | 0;
            g = a + 2512 | 0;
            f = a + 4524 | 0;
            while (1) {
                h = (c[e >> 2] | 0) + 204 | 0;
                j = 0;
                do {
                    k = _c(h, 8) | 0;
                    j = k + j | 0
                } while ((k | 0) == 255);
                k = 0;
                do {
                    l = _c(h, 8) | 0;
                    k = l + k | 0
                } while ((l | 0) == 255);
                do
                    if ((c[g >> 2] | 0) == 39)
                        if ((j | 0) == 257) {
                            b[f >> 1] = _c(h, 16) | 0;
                            break
                        } else if ((j | 0) == 256) {
                    Hc(a);
                    break
                } else {
                    ad(h, k << 3);
                    break
                } else if ((j | 0) == 132) {
                    Hc(a);
                    break
                } else {
                    ad(h, k << 3);
                    break
                }
                while (0);
                h = c[e >> 2] | 0;
                if (((c[h + 216 >> 2] | 0) - (c[h + 212 >> 2] | 0) | 0) <= 0) {
                    a = 15;
                    break
                }
                if (($c(h + 204 | 0, 8) | 0) == 128) {
                    a = 15;
                    break
                }
            }
            if ((a | 0) == 15) {
                i = d;
                return 1
            }
            return 0
        }

        function Hc(b) {
            b = b | 0;
            var d = 0,
                e = 0,
                f = 0,
                g = 0,
                h = 0,
                j = 0;
            d = i;
            e = (c[b + 136 >> 2] | 0) + 204 | 0;
            g = (_c(e, 8) | 0) & 255;
            f = b + 4468 | 0;
            h = 0;
            do {
                if ((g | 0) == 1) ad(e, 16);
                else if (!g) {
                    a[f >> 0] = 1;
                    j = 0;
                    do {
                        a[b + (h << 4) + j + 4420 >> 0] = _c(e, 8) | 0;
                        j = j + 1 | 0
                    } while ((j | 0) != 16)
                } else if ((g | 0) == 2) ad(e, 32);
                h = h + 1 | 0
            } while ((h | 0) != 3);
            i = d;
            return
        }

        function Ic(a, b, d) {
            a = a | 0;
            b = b | 0;
            d = d | 0;
            var e = 0,
                f = 0,
                g = 0,
                h = 0;
            d = i;
            f = c[b + 52 >> 2] | 0;
            e = a + 60 | 0;
            if ((f | 0) > 0) {
                if ((c[e >> 2] | 0) == 0 ? (f = md(f) | 0, c[e >> 2] = f, (f | 0) == 0) : 0) {
                    f = -12;
                    i = d;
                    return f | 0
                }
            } else c[e >> 2] = 0;
            f = a + 12 | 0;
            c[f >> 2] = b;
            c[a + 424 >> 2] = 0;
            c[a + 800 >> 2] = 1;
            h = a + 912 | 0;
            g = a + 936 | 0;
            c[h + 0 >> 2] = 0;
            c[h + 4 >> 2] = 0;
            c[h + 8 >> 2] = 0;
            c[h + 12 >> 2] = 0;
            c[g >> 2] = 0;
            c[g + 4 >> 2] = -2147483648;
            g = a + 928 | 0;
            c[g >> 2] = 0;
            c[g + 4 >> 2] = -2147483648;
            a = Ea[c[b + 76 >> 2] & 3](a) | 0;
            if ((a | 0) >= 0) {
                h = 0;
                i = d;
                return h | 0
            }
            jd(e);
            c[f >> 2] = 0;
            h = a;
            i = d;
            return h | 0
        }

        function Jc(a) {
            a = a | 0;
            var b = 0,
                d = 0,
                e = 0,
                f = 0;
            b = i;
            if (!a) {
                i = b;
                return 0
            }
            e = a + 12 | 0;
            f = c[e >> 2] | 0;
            if ((f | 0) != 0 ? (d = c[f + 92 >> 2] | 0, (d | 0) != 0) : 0) Ea[d & 3](a) | 0;
            c[a + 796 >> 2] = 0;
            jd(a + 60 | 0);
            c[e >> 2] = 0;
            c[a + 808 >> 2] = 0;
            i = b;
            return 0
        }

        function Kc(a, b, d, e, f, g) {
            a = a | 0;
            b = b | 0;
            d = d | 0;
            e = e | 0;
            f = f | 0;
            g = g | 0;
            var h = 0,
                j = 0,
                k = 0,
                l = 0;
            h = i;
            if ((f | 0) <= 0) {
                i = h;
                return 0
            }
            j = (e | 0) == 0;
            k = 0;
            do {
                l = d + ($(k, g) | 0) | 0;
                l = Ia[b & 1](a, l) | 0;
                if (!j) c[e + (k << 2) >> 2] = l;
                k = k + 1 | 0
            } while ((k | 0) != (f | 0));
            i = h;
            return 0
        }

        function Lc(a, b, d, e, f) {
            a = a | 0;
            b = b | 0;
            d = d | 0;
            e = e | 0;
            f = f | 0;
            var g = 0,
                h = 0,
                j = 0,
                k = 0;
            g = i;
            if ((f | 0) <= 0) {
                i = g;
                return 0
            }
            h = (e | 0) == 0;
            j = 0;
            do {
                k = Ga[b & 1](a, d, j, 0) | 0;
                if (!h) c[e + (j << 2) >> 2] = k;
                j = j + 1 | 0
            } while ((j | 0) != (f | 0));
            i = g;
            return 0
        }

        function Mc(b, f, g) {
            b = b | 0;
            f = f | 0;
            g = g | 0;
            var h = 0,
                j = 0,
                k = 0,
                l = 0,
                m = 0,
                n = 0,
                o = 0,
                p = 0;
            g = i;
            h = Bd(c[f + 76 >> 2] | 0) | 0;
            b = h + 4 | 0;
            if (!(a[b >> 0] | 0)) {
                p = 0;
                i = g;
                return p | 0
            }
            k = f + 64 | 0;
            l = h + 5 | 0;
            m = f + 68 | 0;
            n = h + 6 | 0;
            j = 0;
            while (1) {
                p = ($((((e[h + (j << 1) + 8 >> 1] | 0) >>> 11 & 15) + 8 | 0) >>> 3, c[k >> 2] | 0) | 0) + 31 & -32;
                if ((j + -1 | 0) >>> 0 < 2) {
                    p = 0 - (0 - p >> d[l >> 0]) | 0;
                    c[f + (j << 2) + 32 >> 2] = p;
                    o = 0 - (0 - ((c[m >> 2] | 0) + 31 & -32) >> d[n >> 0]) | 0
                } else {
                    c[f + (j << 2) + 32 >> 2] = p;
                    o = (c[m >> 2] | 0) + 31 & -32
                }
                o = sd(($(p, o) | 0) + 32 | 0) | 0;
                c[f + (j << 2) + 304 >> 2] = o;
                if (!o) {
                    b = -1;
                    f = 8;
                    break
                }
                c[f + (j << 2) >> 2] = c[o + 4 >> 2];
                j = j + 1 | 0;
                if ((j | 0) >= (d[b >> 0] | 0)) {
                    b = 0;
                    f = 8;
                    break
                }
            }
            if ((f | 0) == 8) {
                i = g;
                return b | 0
            }
            return 0
        }

        function Nc(a, b) {
            a = a | 0;
            b = b | 0;
            var d = 0,
                e = 0,
                f = 0,
                g = 0;
            d = i;
            ce(a | 0, 0, 976) | 0;
            e = (b | 0) != 0;
            if (e) {
                c[a + 8 >> 2] = c[b + 8 >> 2];
                c[a + 48 >> 2] = c[b + 12 >> 2]
            } else c[a + 8 >> 2] = -1;
            c[a + 100 >> 2] = 0;
            c[a + 104 >> 2] = 1;
            c[a + 888 >> 2] = 0;
            c[a + 892 >> 2] = 1;
            c[a + 896 >> 2] = 0;
            c[a + 900 >> 2] = 1;
            c[a + 476 >> 2] = 1;
            c[a + 816 >> 2] = 1;
            c[a + 820 >> 2] = 1;
            c[a + 220 >> 2] = 0;
            c[a + 224 >> 2] = 1;
            c[a + 136 >> 2] = -1;
            c[a + 416 >> 2] = -1;
            g = a + 696 | 0;
            c[g >> 2] = 0;
            c[g + 4 >> 2] = -2147483648;
            if ((e ? (f = c[b + 52 >> 2] | 0, (f | 0) != 0) : 0) ? (g = md(f) | 0, c[a + 60 >> 2] = g, (g | 0) == 0) : 0) {
                g = -12;
                i = d;
                return g | 0
            }
            g = 0;
            i = d;
            return g | 0
        }

        function Oc(a) {
            a = a | 0;
            var b = 0,
                c = 0;
            b = i;
            c = fd(976) | 0;
            if (c) {
                if ((Nc(c, a) | 0) < 0) {
                    id(c);
                    c = 0
                }
            } else c = 0;
            i = b;
            return c | 0
        }

        function Pc(a, b, d, e) {
            a = a | 0;
            b = b | 0;
            d = d | 0;
            e = e | 0;
            var f = 0,
                g = 0,
                h = 0,
                j = 0,
                k = 0;
            f = i;
            i = i + 80 | 0;
            g = f;
            k = g + 0 | 0;
            j = e + 0 | 0;
            h = k + 80 | 0;
            do {
                c[k >> 2] = c[j >> 2];
                k = k + 4 | 0;
                j = j + 4 | 0
            } while ((k | 0) < (h | 0));
            h = a + 12 | 0;
            j = c[h >> 2] | 0;
            if (!j) {
                k = -22;
                i = f;
                return k | 0
            }
            if (c[j + 8 >> 2] | 0) {
                k = -22;
                i = f;
                return k | 0
            }
            c[d >> 2] = 0;
            j = c[a + 124 >> 2] | 0;
            k = c[a + 128 >> 2] | 0;
            if (!j) {
                if (k) {
                    k = -22;
                    i = f;
                    return k | 0
                }
            } else {
                if (!((j | 0) > 0 & (k | 0) > 0)) {
                    k = -22;
                    i = f;
                    return k | 0
                }
                if ((j + 128 | 0) >>> 0 >= (268435455 / ((k + 128 | 0) >>> 0) | 0) >>> 0) {
                    k = -22;
                    i = f;
                    return k | 0
                }
            }
            yd(b);
            h = c[h >> 2] | 0;
            if (((c[h + 16 >> 2] & 32 | 0) == 0 ? (c[e + 28 >> 2] | 0) == 0 : 0) ? (c[a + 808 >> 2] & 1 | 0) == 0 : 0) {
                k = 0;
                i = f;
                return k | 0
            }
            g = Ga[c[h + 88 >> 2] & 1](a, b, d, g) | 0;
            if (!(c[d >> 2] | 0)) {
                yd(b);
                k = g;
                i = f;
                return k | 0
            } else {
                k = a + 424 | 0;
                c[k >> 2] = (c[k >> 2] | 0) + 1;
                k = g;
                i = f;
                return k | 0
            }
            return 0
        }

        function Qc(a, b, c, d) {
            a = a | 0;
            b = b | 0;
            c = c | 0;
            d = d | 0;
            c = i;
            if ((a | 0) > 0 & (b | 0) > 0 ? (a + 128 | 0) >>> 0 < (268435455 / ((b + 128 | 0) >>> 0) | 0) >>> 0 : 0) {
                d = 0;
                i = c;
                return d | 0
            }
            d = -22;
            i = c;
            return d | 0
        }

        function Rc(a, b) {
            a = a | 0;
            b = b | 0;
            return 0
        }

        function Sc(a, b, d) {
            a = a | 0;
            b = b | 0;
            d = d | 0;
            var e = 0,
                f = 0,
                g = 0,
                h = 0,
                j = 0,
                k = 0,
                l = 0,
                m = 0,
                n = 0;
            f = i;
            e = a + 8 | 0;
            if (!(c[e >> 2] | 0)) {
                g = c[a + 116 >> 2] | 0;
                h = a + 120 | 0;
                j = c[h >> 2] | 0;
                if (!((g | 0) > 0 & (j | 0) > 0)) {
                    l = -22;
                    i = f;
                    return l | 0
                }
                if ((g + 128 | 0) >>> 0 >= (268435455 / ((j + 128 | 0) >>> 0) | 0) >>> 0) {
                    l = -22;
                    i = f;
                    return l | 0
                }
                j = c[a + 136 >> 2] | 0;
                if ((j | 0) < 0) {
                    l = -22;
                    i = f;
                    return l | 0
                }
                k = b + 64 | 0;
                l = b + 68 | 0;
                if ((c[k >> 2] | 0) >= 1 ? (c[l >> 2] | 0) >= 1 : 0) g = 1;
                else {
                    m = a + 792 | 0;
                    n = 0 - (0 - (c[a + 124 >> 2] | 0) >> c[m >> 2]) | 0;
                    c[k >> 2] = (g | 0) > (n | 0) ? g : n;
                    k = c[h >> 2] | 0;
                    g = 0 - (0 - (c[a + 128 >> 2] | 0) >> c[m >> 2]) | 0;
                    c[l >> 2] = (k | 0) > (g | 0) ? k : g;
                    g = 0
                }
                c[b + 76 >> 2] = j
            } else g = 1;
            d = xa[c[a + 476 >> 2] & 1](a, b, d) | 0;
            if (c[e >> 2] | g) {
                n = d;
                i = f;
                return n | 0
            }
            c[b + 64 >> 2] = c[a + 116 >> 2];
            c[b + 68 >> 2] = c[a + 120 >> 2];
            n = d;
            i = f;
            return n | 0
        }

        function Tc(a, b, d) {
            a = a | 0;
            b = b | 0;
            d = d | 0;
            var e = 0;
            e = i;
            c[b + 4 >> 2] = a;
            a = Sc(a, c[b >> 2] | 0, d) | 0;
            i = e;
            return a | 0
        }

        function Uc(a, b) {
            a = a | 0;
            b = b | 0;
            a = i;
            b = c[b >> 2] | 0;
            if (b) yd(b);
            i = a;
            return
        }

        function Vc(a) {
            a = a | 0;
            return
        }

        function Wc(a, b, c) {
            a = a | 0;
            b = b | 0;
            c = c | 0;
            return
        }

        function Xc(a) {
            a = a | 0;
            var b = 0,
                d = 0;
            b = i;
            d = a + 8 | 0;
            c[d >> 2] = 0;
            c[d + 4 >> 2] = -2147483648;
            d = a + 16 | 0;
            c[d >> 2] = 0;
            c[d + 4 >> 2] = -2147483648;
            d = a + 64 | 0;
            c[d >> 2] = -1;
            c[d + 4 >> 2] = -1;
            d = a + 72 | 0;
            c[d >> 2] = 0;
            c[d + 4 >> 2] = 0;
            d = a + 32 | 0;
            c[a >> 2] = 0;
            c[d + 0 >> 2] = 0;
            c[d + 4 >> 2] = 0;
            c[d + 8 >> 2] = 0;
            c[d + 12 >> 2] = 0;
            c[d + 16 >> 2] = 0;
            i = b;
            return
        }

        function Yc(a, b, e) {
            a = a | 0;
            b = b | 0;
            e = e | 0;
            var f = 0,
                g = 0,
                h = 0;
            g = a + 16 | 0;
            c[a + 12 >> 2] = b;
            c[a + 20 >> 2] = b + e;
            h = b + 1 | 0;
            c[g >> 2] = h;
            e = (d[b >> 0] | 0) << 18;
            c[a >> 2] = e;
            f = b + 2 | 0;
            c[g >> 2] = f;
            e = (d[h >> 0] | 0) << 10 | e;
            c[a >> 2] = e;
            c[g >> 2] = b + 3;
            c[a >> 2] = (d[f >> 0] | 0) << 2 | e | 2;
            c[a + 4 >> 2] = 510;
            return
        }

        function Zc() {
            var b = 0,
                e = 0,
                f = 0,
                g = 0,
                h = 0,
                j = 0;
            b = i;
            if (!(c[718] | 0)) e = 0;
            else {
                i = b;
                return
            }
            while (1)
                if (e) {
                    g = (e & 65280 | 0) == 0;
                    a[2880 + e >> 0] = (g ? 8 : 0) - (d[4680 + (g ? e : e >>> 8) >> 0] | 0);
                    e = e + 1 | 0;
                    if ((e | 0) == 512) {
                        e = 0;
                        break
                    } else continue
                } else {
                    a[2880] = 9;
                    e = 1;
                    continue
                }
            while (1) {
                f = e << 1;
                g = 0;
                do {
                    j = a[4224 + (e << 2) + g >> 0] | 0;
                    h = (g << 7) + f | 0;
                    a[(h | 1) + 3392 >> 0] = j;
                    a[h + 3392 >> 0] = j;
                    g = g + 1 | 0
                } while ((g | 0) != 4);
                j = (d[4480 + e >> 0] | 0) << 1;
                a[f + 4032 >> 0] = j;
                a[f + 4033 >> 0] = j | 1;
                if (e) {
                    h = (d[4544 + e >> 0] | 0) << 1;
                    j = 128 - f | 0;
                    a[j + 3903 >> 0] = h;
                    a[j + 3902 >> 0] = h | 1;
                    e = e + 1 | 0;
                    if ((e | 0) == 64) break;
                    else continue
                } else {
                    e = 128 - f | 0;
                    a[e + 3903 >> 0] = 1;
                    a[e + 3902 >> 0] = 0;
                    e = 1;
                    continue
                }
            }
            g = 4160 | 0;
            f = 4608 | 0;
            e = g + 63 | 0;
            do {
                a[g >> 0] = a[f >> 0] | 0;
                g = g + 1 | 0;
                f = f + 1 | 0
            } while ((g | 0) < (e | 0));
            c[718] = 1;
            i = b;
            return
        }

        function _c(a, b) {
            a = a | 0;
            b = b | 0;
            var e = 0,
                f = 0,
                g = 0,
                h = 0;
            e = i;
            f = a + 8 | 0;
            h = c[f >> 2] | 0;
            g = c[a + 16 >> 2] | 0;
            a = (c[a >> 2] | 0) + (h >>> 3) | 0;
            a = (ee(d[a >> 0] | d[a + 1 >> 0] << 8 | d[a + 2 >> 0] << 16 | d[a + 3 >> 0] << 24 | 0) | 0) << (h & 7) >>> (32 - b | 0);
            b = h + b | 0;
            c[f >> 2] = g >>> 0 > b >>> 0 ? b : g;
            i = e;
            return a | 0
        }

        function $c(a, b) {
            a = a | 0;
            b = b | 0;
            var e = 0,
                f = 0;
            e = i;
            f = c[a + 8 >> 2] | 0;
            a = (c[a >> 2] | 0) + (f >>> 3) | 0;
            a = (ee(d[a >> 0] | d[a + 1 >> 0] << 8 | d[a + 2 >> 0] << 16 | d[a + 3 >> 0] << 24 | 0) | 0) << (f & 7) >>> (32 - b | 0);
            i = e;
            return a | 0
        }

        function ad(a, b) {
            a = a | 0;
            b = b | 0;
            var d = 0;
            d = a + 8 | 0;
            a = c[a + 16 >> 2] | 0;
            b = (c[d >> 2] | 0) + b | 0;
            c[d >> 2] = a >>> 0 > b >>> 0 ? b : a;
            return
        }

        function bd(a) {
            a = a | 0;
            var b = 0,
                e = 0,
                f = 0;
            e = a + 8 | 0;
            f = c[e >> 2] | 0;
            b = (d[(c[a >> 2] | 0) + (f >>> 3) >> 0] | 0) << (f & 7) >>> 7 & 1;
            c[e >> 2] = ((f | 0) < (c[a + 16 >> 2] | 0) & 1) + f;
            return b | 0
        }

        function cd(a, b) {
            a = a | 0;
            b = b | 0;
            var e = 0,
                f = 0,
                g = 0,
                h = 0,
                j = 0,
                k = 0;
            e = i;
            if (!b) {
                j = 0;
                i = e;
                return j | 0
            }
            f = a + 8 | 0;
            h = c[f >> 2] | 0;
            g = c[a + 16 >> 2] | 0;
            j = c[a >> 2] | 0;
            a = j + (h >>> 3) | 0;
            a = (ee(d[a >> 0] | d[a + 1 >> 0] << 8 | d[a + 2 >> 0] << 16 | d[a + 3 >> 0] << 24 | 0) | 0) << (h & 7);
            if ((b | 0) < 26) {
                j = h + b | 0;
                c[f >> 2] = g >>> 0 > j >>> 0 ? j : g;
                j = a >>> (32 - b | 0);
                i = e;
                return j | 0
            } else {
                k = h + 16 | 0;
                k = g >>> 0 > k >>> 0 ? k : g;
                c[f >> 2] = k;
                h = b + -16 | 0;
                j = j + (k >>> 3) | 0;
                j = (ee(d[j >> 0] | d[j + 1 >> 0] << 8 | d[j + 2 >> 0] << 16 | d[j + 3 >> 0] << 24 | 0) | 0) << (k & 7) >>> (48 - b | 0);
                b = k + h | 0;
                c[f >> 2] = g >>> 0 > b >>> 0 ? b : g;
                j = j | a >>> 16 << h;
                i = e;
                return j | 0
            }
            return 0
        }

        function dd(a) {
            a = a | 0;
            var b = 0,
                e = 0,
                f = 0,
                g = 0,
                h = 0,
                j = 0;
            b = i;
            i = i + 32 | 0;
            e = b;
            c[e + 0 >> 2] = c[a + 0 >> 2];
            c[e + 4 >> 2] = c[a + 4 >> 2];
            c[e + 8 >> 2] = c[a + 8 >> 2];
            c[e + 12 >> 2] = c[a + 12 >> 2];
            c[e + 16 >> 2] = c[a + 16 >> 2];
            e = cd(e, 32) | 0;
            f = e >>> 0 > 65535;
            e = f ? e >>> 16 : e;
            f = f ? 16 : 0;
            if (e & 65280) {
                f = f | 8;
                e = e >>> 8
            }
            j = 31 - f - (d[4680 + e >> 0] | 0) | 0;
            g = a + 8 | 0;
            f = c[g >> 2] | 0;
            e = 0 - f | 0;
            h = (c[a + 16 >> 2] | 0) - f | 0;
            if ((j | 0) < (e | 0)) {
                h = e;
                h = h + f | 0;
                c[g >> 2] = h;
                j = j + 1 | 0;
                j = cd(a, j) | 0;
                j = j + -1 | 0;
                i = b;
                return j | 0
            }
            h = (h | 0) < (j | 0) ? h : j;
            h = h + f | 0;
            c[g >> 2] = h;
            j = j + 1 | 0;
            j = cd(a, j) | 0;
            j = j + -1 | 0;
            i = b;
            return j | 0
        }

        function ed(a) {
            a = a | 0;
            var b = 0;
            b = i;
            a = dd(a) | 0;
            if (!(a & 1)) {
                a = 0 - (a >>> 1) | 0;
                i = b;
                return a | 0
            } else {
                a = (a + 1 | 0) >>> 1;
                i = b;
                return a | 0
            }
            return 0
        }

        function fd(a) {
            a = a | 0;
            var b = 0,
                d = 0,
                e = 0;
            b = i;
            d = c[1168] | 0;
            if ((d + -32 | 0) >>> 0 >= a >>> 0) {
                e = Vd(a) | 0;
                if ((e | 0) == 0 & (a | 0) == 0)
                    if ((d | 0) == 32) e = 0;
                    else e = Vd(1) | 0
            } else e = 0;
            i = b;
            return e | 0
        }

        function gd(a, b) {
            a = a | 0;
            b = b | 0;
            var d = 0;
            d = i;
            if (((c[1168] | 0) + -32 | 0) >>> 0 < b >>> 0) {
                b = 0;
                i = d;
                return b | 0
            }
            b = Xd(a, ((b | 0) == 0 & 1) + b | 0) | 0;
            i = d;
            return b | 0
        }

        function hd(a, b, d) {
            a = a | 0;
            b = b | 0;
            d = d | 0;
            var e = 0,
                f = 0;
            e = i;
            f = $(d, b) | 0;
            if ((d | b) >>> 0 > 65535 & (d | 0) != 0 ? ((f >>> 0) / (d >>> 0) | 0 | 0) != (b | 0) : 0) {
                Wd(a);
                d = 0;
                i = e;
                return d | 0
            }
            if (((c[1168] | 0) + -32 | 0) >>> 0 < f >>> 0) b = 0;
            else b = Xd(a, ((f | 0) == 0 & 1) + f | 0) | 0;
            if ((b | 0) != 0 | (f | 0) == 0) {
                d = b;
                i = e;
                return d | 0
            }
            Wd(a);
            d = 0;
            i = e;
            return d | 0
        }

        function id(a) {
            a = a | 0;
            var b = 0;
            b = i;
            Wd(a);
            i = b;
            return
        }

        function jd(a) {
            a = a | 0;
            var b = 0;
            b = i;
            Wd(c[a >> 2] | 0);
            c[a >> 2] = 0;
            i = b;
            return
        }

        function kd(a, b, d) {
            a = a | 0;
            b = b | 0;
            d = d | 0;
            var e = 0,
                f = 0;
            e = i;
            if (((d | 0) != 0 ? (2147483647 / (d >>> 0) | 0) >>> 0 > b >>> 0 : 0) ? (f = $(d, b) | 0, ((c[1168] | 0) + -32 | 0) >>> 0 >= f >>> 0) : 0) a = Xd(a, ((f | 0) == 0 & 1) + f | 0) | 0;
            else a = 0;
            i = e;
            return a | 0
        }

        function ld(a, b, d) {
            a = a | 0;
            b = b | 0;
            d = d | 0;
            var e = 0,
                f = 0;
            f = i;
            e = hd(c[a >> 2] | 0, b, d) | 0;
            c[a >> 2] = e;
            i = f;
            return ((e | 0) != 0 | (b | 0) == 0 | (d | 0) == 0 ? 0 : -12) | 0
        }

        function md(a) {
            a = a | 0;
            var b = 0,
                c = 0;
            c = i;
            b = fd(a) | 0;
            if (b) ce(b | 0, 0, a | 0) | 0;
            i = c;
            return b | 0
        }

        function nd(a, b, d) {
            a = a | 0;
            b = b | 0;
            d = d | 0;
            var e = 0,
                f = 0;
            e = i;
            if ((c[b >> 2] | 0) >>> 0 > d >>> 0) {
                i = e;
                return
            }
            f = ((d * 17 | 0) >>> 4) + 32 | 0;
            d = f >>> 0 > d >>> 0 ? f : d;
            Wd(c[a >> 2] | 0);
            f = fd(d) | 0;
            c[a >> 2] = f;
            c[b >> 2] = (f | 0) == 0 ? 0 : d;
            i = e;
            return
        }

        function od(a, b) {
            a = a | 0;
            b = b | 0;
            var c = 0;
            c = i;
            if ((b | 0) != 0 ? (2147483647 / (b >>> 0) | 0) >>> 0 > a >>> 0 : 0) b = fd($(b, a) | 0) | 0;
            else b = 0;
            i = c;
            return b | 0
        }

        function pd(a, b) {
            a = a | 0;
            b = b | 0;
            var c = 0,
                d = 0,
                e = 0;
            c = i;
            if (((b | 0) != 0 ? (2147483647 / (b >>> 0) | 0) >>> 0 > a >>> 0 : 0) ? (e = $(b, a) | 0, d = fd(e) | 0, (d | 0) != 0) : 0) ce(d | 0, 0, e | 0) | 0;
            else d = 0;
            i = c;
            return d | 0
        }

        function qd(a, b, d, e, f) {
            a = a | 0;
            b = b | 0;
            d = d | 0;
            e = e | 0;
            f = f | 0;
            var g = 0,
                h = 0,
                j = 0;
            g = i;
            i = i + 16 | 0;
            h = g;
            j = md(24) | 0;
            c[h >> 2] = j;
            if (!j) {
                f = 0;
                i = g;
                return f | 0
            }
            c[j >> 2] = a;
            c[j + 4 >> 2] = b;
            c[j + 12 >> 2] = (d | 0) != 0 ? d : 7;
            c[j + 16 >> 2] = e;
            c[j + 8 >> 2] = 1;
            if (f & 1) {
                f = (c[h >> 2] | 0) + 20 | 0;
                c[f >> 2] = c[f >> 2] | 1
            }
            j = md(12) | 0;
            if (!j) {
                jd(h);
                f = 0;
                i = g;
                return f | 0
            } else {
                c[j >> 2] = c[h >> 2];
                c[j + 4 >> 2] = a;
                c[j + 8 >> 2] = b;
                f = j;
                i = g;
                return f | 0
            }
            return 0
        }

        function rd(a, b) {
            a = a | 0;
            b = b | 0;
            a = i;
            id(b);
            i = a;
            return
        }

        function sd(a) {
            a = a | 0;
            var b = 0,
                d = 0,
                e = 0;
            b = i;
            i = i + 16 | 0;
            d = b;
            e = fd(a) | 0;
            c[d >> 2] = e;
            if (e) {
                a = qd(e, a, 7, 0, 0) | 0;
                if (!a) {
                    jd(d);
                    a = 0
                }
            } else a = 0;
            i = b;
            return a | 0
        }

        function td(a) {
            a = a | 0;
            var b = 0,
                d = 0;
            b = i;
            d = sd(a) | 0;
            if (!d) {
                d = 0;
                i = b;
                return d | 0
            }
            ce(c[d + 4 >> 2] | 0, 0, a | 0) | 0;
            i = b;
            return d | 0
        }

        function ud(a) {
            a = a | 0;
            var b = 0,
                d = 0,
                e = 0,
                f = 0;
            b = i;
            i = i + 16 | 0;
            e = b;
            d = md(12) | 0;
            if (!d) {
                e = 0;
                i = b;
                return e | 0
            }
            c[d + 0 >> 2] = c[a + 0 >> 2];
            c[d + 4 >> 2] = c[a + 4 >> 2];
            c[d + 8 >> 2] = c[a + 8 >> 2];
            f = (c[a >> 2] | 0) + 8 | 0;
            a = c[f >> 2] | 0;
            c[f >> 2] = a + 1;
            c[e >> 2] = a + 1;
            e = d;
            i = b;
            return e | 0
        }

        function vd(a) {
            a = a | 0;
            var b = 0,
                d = 0,
                e = 0,
                f = 0;
            b = i;
            i = i + 16 | 0;
            e = b + 4 | 0;
            d = b;
            if (!a) {
                i = b;
                return
            }
            f = c[a >> 2] | 0;
            if (!f) {
                i = b;
                return
            }
            f = c[f >> 2] | 0;
            c[d >> 2] = f;
            jd(a);
            a = f + 8 | 0;
            f = c[a >> 2] | 0;
            c[a >> 2] = f + -1;
            c[e >> 2] = f + -1;
            if (c[e >> 2] | 0) {
                i = b;
                return
            }
            f = c[d >> 2] | 0;
            Ca[c[f + 12 >> 2] & 7](c[f + 16 >> 2] | 0, c[f >> 2] | 0);
            jd(d);
            i = b;
            return
        }

        function wd() {
            var a = 0,
                b = 0,
                d = 0;
            a = i;
            b = md(400) | 0;
            if (!b) {
                b = 0;
                i = a;
                return b | 0
            }
            ce(b | 0, 0, 400) | 0;
            d = b + 136 | 0;
            c[d >> 2] = 0;
            c[d + 4 >> 2] = -2147483648;
            d = b + 144 | 0;
            c[d >> 2] = 0;
            c[d + 4 >> 2] = -2147483648;
            d = b + 128 | 0;
            c[d >> 2] = 0;
            c[d + 4 >> 2] = -2147483648;
            d = b + 360 | 0;
            c[d >> 2] = 0;
            c[d + 4 >> 2] = -2147483648;
            d = b + 376 | 0;
            c[d >> 2] = 0;
            c[d + 4 >> 2] = 0;
            d = b + 368 | 0;
            c[d >> 2] = -1;
            c[d + 4 >> 2] = -1;
            c[b + 392 >> 2] = -1;
            c[b + 80 >> 2] = 1;
            c[b + 120 >> 2] = 0;
            c[b + 124 >> 2] = 1;
            c[b + 76 >> 2] = -1;
            c[b + 344 >> 2] = 2;
            c[b + 348 >> 2] = 2;
            c[b + 352 >> 2] = 2;
            c[b + 340 >> 2] = 0;
            c[b + 356 >> 2] = 0;
            i = a;
            return b | 0
        }

        function xd(a) {
            a = a | 0;
            var b = 0,
                d = 0;
            b = i;
            if ((a | 0) != 0 ? (d = c[a >> 2] | 0, (d | 0) != 0) : 0) {
                yd(d);
                jd(a)
            }
            i = b;
            return
        }

        function yd(a) {
            a = a | 0;
            var b = 0,
                d = 0;
            b = i;
            vd(a + 304 | 0);
            vd(a + 308 | 0);
            vd(a + 312 | 0);
            vd(a + 316 | 0);
            vd(a + 320 | 0);
            vd(a + 324 | 0);
            vd(a + 328 | 0);
            vd(a + 332 | 0);
            ce(a | 0, 0, 400) | 0;
            d = a + 136 | 0;
            c[d >> 2] = 0;
            c[d + 4 >> 2] = -2147483648;
            d = a + 144 | 0;
            c[d >> 2] = 0;
            c[d + 4 >> 2] = -2147483648;
            d = a + 128 | 0;
            c[d >> 2] = 0;
            c[d + 4 >> 2] = -2147483648;
            d = a + 360 | 0;
            c[d >> 2] = 0;
            c[d + 4 >> 2] = -2147483648;
            d = a + 376 | 0;
            c[d >> 2] = 0;
            c[d + 4 >> 2] = 0;
            d = a + 368 | 0;
            c[d >> 2] = -1;
            c[d + 4 >> 2] = -1;
            c[a + 392 >> 2] = -1;
            c[a + 80 >> 2] = 1;
            c[a + 120 >> 2] = 0;
            c[a + 124 >> 2] = 1;
            c[a + 76 >> 2] = -1;
            c[a + 344 >> 2] = 2;
            c[a + 348 >> 2] = 2;
            c[a + 352 >> 2] = 2;
            c[a + 340 >> 2] = 0;
            c[a + 356 >> 2] = 0;
            i = b;
            return
        }

        function zd(a, b) {
            a = a | 0;
            b = b | 0;
            var d = 0;
            d = i;
            fe(a | 0, b | 0, 400) | 0;
            ce(b | 0, 0, 400) | 0;
            a = b + 136 | 0;
            c[a >> 2] = 0;
            c[a + 4 >> 2] = -2147483648;
            a = b + 144 | 0;
            c[a >> 2] = 0;
            c[a + 4 >> 2] = -2147483648;
            a = b + 128 | 0;
            c[a >> 2] = 0;
            c[a + 4 >> 2] = -2147483648;
            a = b + 360 | 0;
            c[a >> 2] = 0;
            c[a + 4 >> 2] = -2147483648;
            a = b + 376 | 0;
            c[a >> 2] = 0;
            c[a + 4 >> 2] = 0;
            a = b + 368 | 0;
            c[a >> 2] = -1;
            c[a + 4 >> 2] = -1;
            c[b + 392 >> 2] = -1;
            c[b + 80 >> 2] = 1;
            c[b + 120 >> 2] = 0;
            c[b + 124 >> 2] = 1;
            c[b + 76 >> 2] = -1;
            c[b + 344 >> 2] = 2;
            c[b + 348 >> 2] = 2;
            c[b + 352 >> 2] = 2;
            c[b + 340 >> 2] = 0;
            c[b + 356 >> 2] = 0;
            i = d;
            return
        }

        function Ad(a, b) {
            a = a | 0;
            b = b | 0;
            var d = 0,
                e = 0,
                f = 0,
                g = 0,
                h = 0,
                j = 0;
            d = i;
            c[a + 76 >> 2] = c[b + 76 >> 2];
            c[a + 64 >> 2] = c[b + 64 >> 2];
            c[a + 68 >> 2] = c[b + 68 >> 2];
            c[a + 388 >> 2] = c[b + 388 >> 2];
            j = b + 296 | 0;
            h = c[j + 4 >> 2] | 0;
            f = a + 296 | 0;
            c[f >> 2] = c[j >> 2];
            c[f + 4 >> 2] = h;
            c[a + 72 >> 2] = c[b + 72 >> 2];
            f = c[b + 304 >> 2] | 0;
            if (!f) ta();
            else {
                e = f;
                g = 0
            }
            while (1) {
                if ((e | 0) != 0 ? (j = ud(e) | 0, c[a + (g << 2) + 304 >> 2] = j, (j | 0) == 0) : 0) {
                    e = 5;
                    break
                }
                g = g + 1 | 0;
                if (g >>> 0 >= 8) {
                    e = 8;
                    break
                }
                e = c[b + (g << 2) + 304 >> 2] | 0
            }
            if ((e | 0) == 5) {
                yd(a);
                j = -12;
                i = d;
                return j | 0
            } else if ((e | 0) == 8) {
                c[a + 0 >> 2] = c[b + 0 >> 2];
                c[a + 4 >> 2] = c[b + 4 >> 2];
                c[a + 8 >> 2] = c[b + 8 >> 2];
                c[a + 12 >> 2] = c[b + 12 >> 2];
                c[a + 16 >> 2] = c[b + 16 >> 2];
                c[a + 20 >> 2] = c[b + 20 >> 2];
                c[a + 24 >> 2] = c[b + 24 >> 2];
                c[a + 28 >> 2] = c[b + 28 >> 2];
                j = a + 32 | 0;
                h = b + 32 | 0;
                c[j + 0 >> 2] = c[h + 0 >> 2];
                c[j + 4 >> 2] = c[h + 4 >> 2];
                c[j + 8 >> 2] = c[h + 8 >> 2];
                c[j + 12 >> 2] = c[h + 12 >> 2];
                c[j + 16 >> 2] = c[h + 16 >> 2];
                c[j + 20 >> 2] = c[h + 20 >> 2];
                c[j + 24 >> 2] = c[h + 24 >> 2];
                c[j + 28 >> 2] = c[h + 28 >> 2];
                j = 0;
                i = d;
                return j | 0
            }
            return 0
        }

        function Bd(a) {
            a = a | 0;
            var b = 0,
                d = 0,
                e = 0,
                f = 0;
            d = i;
            e = 0;
            while (1) {
                f = e + 1 | 0;
                if ((c[4936 + (e * 24 | 0) >> 2] | 0) == (a | 0)) break;
                if (f >>> 0 < 4) e = f;
                else {
                    e = 0;
                    b = 5;
                    break
                }
            }
            if ((b | 0) == 5) {
                i = d;
                return e | 0
            }
            f = 4940 + (e * 24 | 0) | 0;
            i = d;
            return f | 0
        }

        function Cd(b, d, e) {
            b = b | 0;
            d = d | 0;
            e = e | 0;
            var f = 0,
                g = 0;
            f = i;
            g = (c[b + 24 >> 2] | 0) == 0 ? 1 : 3;
            if ((g | 0) > (e | 0)) {
                b = c[b + 8 >> 2] | 0;
                c[d >> 2] = c[b + (e << 2) + 32 >> 2];
                b = c[b + (e << 2) >> 2] | 0;
                i = f;
                return b | 0
            }
            if ((a[b + 29 >> 0] | 0) != 0 & (g | 0) == (e | 0)) {
                b = c[b + 12 >> 2] | 0;
                c[d >> 2] = c[b + 32 >> 2];
                b = c[b >> 2] | 0;
                i = f;
                return b | 0
            } else {
                c[d >> 2] = 0;
                b = 0;
                i = f;
                return b | 0
            }
            return 0
        }

        function Dd(d, e) {
            d = d | 0;
            e = e | 0;
            var f = 0,
                g = 0,
                h = 0;
            f = i;
            if (!(c[d + 8 >> 2] | 0)) {
                h = -1;
                i = f;
                return h | 0
            }
            c[e >> 2] = c[d + 16 >> 2];
            c[e + 4 >> 2] = c[d + 20 >> 2];
            a[e + 8 >> 0] = c[d + 24 >> 2];
            g = d + 31 | 0;
            if (!(a[d + 29 >> 0] | 0)) h = 0;
            else h = (a[g >> 0] | 0) == 0 & 1;
            a[e + 9 >> 0] = h;
            a[e + 12 >> 0] = a[d + 33 >> 0] | 0;
            a[e + 13 >> 0] = a[g >> 0] | 0;
            a[e + 14 >> 0] = a[d + 32 >> 0] | 0;
            a[e + 10 >> 0] = c[d + 36 >> 2];
            a[e + 11 >> 0] = a[d + 30 >> 0] | 0;
            a[e + 15 >> 0] = a[d + 34 >> 0] | 0;
            b[e + 16 >> 1] = b[d + 48 >> 1] | 0;
            h = 0;
            i = f;
            return h | 0
        }

        function Ed(b, e) {
            b = b | 0;
            e = e | 0;
            var f = 0,
                g = 0,
                h = 0,
                j = 0,
                k = 0,
                l = 0,
                m = 0,
                n = 0,
                o = 0.0,
                p = 0,
                q = 0.0,
                r = 0.0,
                s = 0.0,
                t = 0,
                u = 0.0,
                v = 0,
                w = 0.0,
                x = 0.0,
                y = 0.0;
            f = i;
            if (!(c[b + 8 >> 2] | 0)) {
                t = -1;
                i = f;
                return t | 0
            }
            g = b + 68 | 0;
            if ((a[g >> 0] | 0) != 0 | e >>> 0 > 1) {
                t = -1;
                i = f;
                return t | 0
            }
            a[b + 76 >> 0] = (e | 0) == 1 & 1;
            l = b + 77 | 0;
            a[l >> 0] = 0;
            a[b + 78 >> 0] = 0;
            h = b + 24 | 0;
            if (((c[h >> 2] | 0) + -1 | 0) >>> 0 < 2 ? (t = b + 16 | 0, p = c[t >> 2] | 0, j = b + 84 | 0, c[j >> 2] = (p + 1 | 0) / 2 | 0, c[b + 88 >> 2] = ((c[b + 20 >> 2] | 0) + 1 | 0) / 2 | 0, c[b + 124 >> 2] = fd(p << 1) | 0, c[b + 128 >> 2] = fd(c[t >> 2] << 1) | 0, c[b + 196 >> 2] = fd((c[j >> 2] << 1) + 14 | 0) | 0, (c[h >> 2] | 0) == 1) : 0) {
                m = 0;
                do {
                    c[b + (m << 2) + 132 >> 2] = fd(c[j >> 2] << 1) | 0;
                    c[b + (m << 2) + 164 >> 2] = fd(c[j >> 2] << 1) | 0;
                    m = m + 1 | 0
                } while ((m | 0) != 8)
            }
            j = d[b + 30 >> 0] | 0;
            v = (a[l >> 0] | 0) != 0 ? 16 : 8;
            l = b + 36 | 0;
            t = c[l >> 2] | 0;
            m = a[b + 32 >> 0] | 0;
            n = m & 255;
            p = 30 - v | 0;
            o = +((1 << v) + -1 | 0) * +(1 << p | 0);
            q = o / +((1 << j) + -1 | 0);
            m = m << 24 >> 24 != 0;
            if (m) {
                v = j + -8 | 0;
                r = o / +(224 << v | 0);
                o = o / +(219 << v | 0)
            } else {
                r = q;
                o = q
            }
            if (!t) {
                u = .114;
                s = .299;
                k = 11
            } else if ((t | 0) == 3) {
                u = .0722;
                s = .2126;
                k = 11
            } else if ((t | 0) == 4) {
                u = .0593;
                s = .2627;
                k = 11
            }
            if ((k | 0) == 11) {
                y = 1.0 - s;
                c[b + 220 >> 2] = sa(+(r * y * 2.0)) | 0;
                w = 1.0 - u;
                x = w - s;
                c[b + 224 >> 2] = sa(+(r * (u * 2.0 * w / x))) | 0;
                c[b + 228 >> 2] = sa(+(r * (s * 2.0 * y / x))) | 0;
                c[b + 232 >> 2] = sa(+(r * w * 2.0)) | 0
            }
            k = sa(+q) | 0;
            c[b + 208 >> 2] = k;
            c[b + 200 >> 2] = p;
            t = 1 << p + -1;
            p = b + 204 | 0;
            c[p >> 2] = t;
            c[b + 236 >> 2] = 1 << j + -1;
            if (m) {
                v = sa(+o) | 0;
                c[b + 212 >> 2] = v;
                v = $(v, -16 << j + -8) | 0;
                c[b + 216 >> 2] = v + (c[p >> 2] | 0)
            } else {
                c[b + 212 >> 2] = k;
                c[b + 216 >> 2] = t
            }
            c[b + 240 >> 2] = j;
            c[b + 244 >> 2] = n;
            if (!(c[h >> 2] | 0)) c[b + 248 >> 2] = 7;
            else c[b + 248 >> 2] = c[6064 + (c[l >> 2] << 2) >> 2];
            a[g >> 0] = 1;
            c[b + 72 >> 2] = e;
            c[b + 92 >> 2] = Cd(b, b + 108 | 0, 0) | 0;
            if (!(c[h >> 2] | 0)) e = 1;
            else {
                c[b + 96 >> 2] = Cd(b, b + 112 | 0, 1) | 0;
                c[b + 100 >> 2] = Cd(b, b + 116 | 0, 2) | 0;
                e = 3
            }
            if (!(a[b + 29 >> 0] | 0)) c[b + 104 >> 2] = 0;
            else c[b + 104 >> 2] = Cd(b, b + 120 | 0, e) | 0;
            c[b + 80 >> 2] = 0;
            v = 0;
            i = f;
            return v | 0
        }

        function Fd(a, b, d) {
            a = a | 0;
            b = b | 0;
            d = d | 0;
            c[b >> 2] = 0;
            c[d >> 2] = 1;
            return
        }

        function Gd(f, g) {
            f = f | 0;
            g = g | 0;
            var h = 0,
                j = 0,
                k = 0,
                l = 0,
                m = 0,
                n = 0,
                o = 0,
                p = 0,
                q = 0,
                r = 0,
                s = 0,
                t = 0,
                u = 0,
                v = 0,
                w = 0,
                x = 0,
                y = 0;
            k = i;
            j = f + 80 | 0;
            n = c[j >> 2] | 0;
            if (n >>> 0 >= (c[f + 20 >> 2] | 0) >>> 0) {
                w = -1;
                i = k;
                return w | 0
            }
            h = c[f + 16 >> 2] | 0;
            o = (c[f + 92 >> 2] | 0) + ($(c[f + 108 >> 2] | 0, n) | 0) | 0;
            l = f + 76 | 0;
            if (!(a[l >> 0] | 0)) m = (a[f + 78 >> 0] | 0) != 0 ? 4 : 3;
            else m = 4;
            p = c[f + 24 >> 2] | 0;
            if ((p | 0) == 2) {
                w = (c[f + 96 >> 2] | 0) + ($(c[f + 112 >> 2] | 0, n) | 0) | 0;
                r = (c[f + 100 >> 2] | 0) + ($(c[f + 116 >> 2] | 0, n) | 0) | 0;
                v = f + 124 | 0;
                s = f + 30 | 0;
                t = f + 28 | 0;
                u = f + 196 | 0;
                Id(c[v >> 2] | 0, w, h, d[s >> 0] | 0, d[t >> 0] | 0, c[u >> 2] | 0);
                w = f + 128 | 0;
                Id(c[w >> 2] | 0, r, h, d[s >> 0] | 0, d[t >> 0] | 0, c[u >> 2] | 0);
                za[c[f + 248 >> 2] & 7](f + 200 | 0, g, o, c[v >> 2] | 0, c[w >> 2] | 0, h, m)
            } else if (!p) za[c[f + 248 >> 2] & 7](f + 200 | 0, g, o, 0, 0, h, m);
            else if ((p | 0) == 1) {
                if (!n) {
                    v = f + 96 | 0;
                    p = f + 112 | 0;
                    q = f + 100 | 0;
                    r = f + 116 | 0;
                    s = f + 84 | 0;
                    t = f + 88 | 0;
                    u = 0;
                    do {
                        w = (u | 0) > 4 ? u + -8 | 0 : u;
                        if ((w | 0) < 0) w = 0;
                        else {
                            x = c[t >> 2] | 0;
                            w = (w | 0) < (x | 0) ? w : x + -1 | 0
                        }
                        y = (c[v >> 2] | 0) + ($(c[p >> 2] | 0, w) | 0) | 0;
                        x = (c[q >> 2] | 0) + ($(c[r >> 2] | 0, w) | 0) | 0;
                        fe(c[f + (u << 2) + 132 >> 2] | 0, y | 0, c[s >> 2] << 1 | 0) | 0;
                        fe(c[f + (u << 2) + 164 >> 2] | 0, x | 0, c[s >> 2] << 1 | 0) | 0;
                        u = u + 1 | 0
                    } while ((u | 0) != 8)
                }
                p = n >> 1;
                q = (p | 0) % 8 | 0;
                y = n & 1;
                s = f + 124 | 0;
                v = f + 196 | 0;
                w = f + 30 | 0;
                x = f + 28 | 0;
                Hd(c[s >> 2] | 0, f + 132 | 0, h, q, c[v >> 2] | 0, d[w >> 0] | 0, y, d[x >> 0] | 0);
                r = f + 128 | 0;
                Hd(c[r >> 2] | 0, f + 164 | 0, h, q, c[v >> 2] | 0, d[w >> 0] | 0, y, d[x >> 0] | 0);
                if (y) {
                    w = (q + 5 | 0) % 8 | 0;
                    v = p + 5 | 0;
                    x = c[f + 88 >> 2] | 0;
                    x = (v | 0) < (x | 0) ? v : x + -1 | 0;
                    v = (c[f + 96 >> 2] | 0) + ($(x, c[f + 112 >> 2] | 0) | 0) | 0;
                    x = (c[f + 100 >> 2] | 0) + ($(c[f + 116 >> 2] | 0, x) | 0) | 0;
                    y = f + 84 | 0;
                    fe(c[f + (w << 2) + 132 >> 2] | 0, v | 0, c[y >> 2] << 1 | 0) | 0;
                    fe(c[f + (w << 2) + 164 >> 2] | 0, x | 0, c[y >> 2] << 1 | 0) | 0
                }
                za[c[f + 248 >> 2] & 7](f + 200 | 0, g, o, c[s >> 2] | 0, c[r >> 2] | 0, h, m)
            } else if ((p | 0) == 3) {
                x = (c[f + 96 >> 2] | 0) + ($(c[f + 112 >> 2] | 0, n) | 0) | 0;
                y = (c[f + 100 >> 2] | 0) + ($(c[f + 116 >> 2] | 0, n) | 0) | 0;
                za[c[f + 248 >> 2] & 7](f + 200 | 0, g, o, x, y, h, m)
            } else {
                y = -1;
                i = k;
                return y | 0
            }
            a: do
                if (!(a[f + 31 >> 0] | 0)) {
                    if (a[l >> 0] | 0) {
                        if (!(a[f + 29 >> 0] | 0)) {
                            if ((h | 0) <= 0) break;
                            f = g + 3 | 0;
                            g = 0;
                            while (1) {
                                a[f >> 0] = -1;
                                g = g + 1 | 0;
                                if ((g | 0) == (h | 0)) break a;
                                else f = f + 4 | 0
                            }
                        }
                        l = (c[f + 104 >> 2] | 0) + ($(c[f + 120 >> 2] | 0, n) | 0) | 0;
                        p = g + 3 | 0;
                        if ((c[f + 240 >> 2] | 0) == 8) {
                            if ((h | 0) > 0) {
                                m = 0;
                                while (1) {
                                    a[p >> 0] = b[l + (m << 1) >> 1];
                                    m = m + 1 | 0;
                                    if ((m | 0) == (h | 0)) break;
                                    else p = p + 4 | 0
                                }
                            }
                        } else {
                            m = c[f + 208 >> 2] | 0;
                            n = c[f + 204 >> 2] | 0;
                            o = c[f + 200 >> 2] | 0;
                            if ((h | 0) > 0) {
                                q = 0;
                                while (1) {
                                    a[p >> 0] = ($(e[l + (q << 1) >> 1] | 0, m) | 0) + n >> o;
                                    q = q + 1 | 0;
                                    if ((q | 0) == (h | 0)) break;
                                    else p = p + 4 | 0
                                }
                            }
                        }
                        if (a[f + 33 >> 0] | 0) {
                            if (!(c[1258] | 0)) {
                                c[1258] = 1;
                                f = 1;
                                do {
                                    c[5040 + (f << 2) >> 2] = (((f | 0) / 2 | 0) + 16711808 | 0) / (f | 0) | 0;
                                    f = f + 1 | 0
                                } while ((f | 0) != 256)
                            }
                            if ((h | 0) > 0) {
                                f = 0;
                                while (1) {
                                    l = a[g + 3 >> 0] | 0;
                                    if (!(l << 24 >> 24)) {
                                        a[g >> 0] = -1;
                                        a[g + 1 >> 0] = -1;
                                        a[g + 2 >> 0] = -1
                                    } else {
                                        m = c[5040 + ((l & 255) << 2) >> 2] | 0;
                                        n = a[g >> 0] | 0;
                                        if ((n & 255) < (l & 255)) n = (($(n & 255, m) | 0) + 32768 | 0) >>> 16 & 255;
                                        else n = -1;
                                        a[g >> 0] = n;
                                        n = g + 1 | 0;
                                        o = a[n >> 0] | 0;
                                        if ((o & 255) < (l & 255)) o = (($(o & 255, m) | 0) + 32768 | 0) >>> 16 & 255;
                                        else o = -1;
                                        a[n >> 0] = o;
                                        n = g + 2 | 0;
                                        o = a[n >> 0] | 0;
                                        if ((o & 255) < (l & 255)) l = (($(o & 255, m) | 0) + 32768 | 0) >>> 16 & 255;
                                        else l = -1;
                                        a[n >> 0] = l
                                    }
                                    f = f + 1 | 0;
                                    if ((f | 0) == (h | 0)) break;
                                    else g = g + 4 | 0
                                }
                            }
                        }
                    }
                } else {
                    n = (c[f + 104 >> 2] | 0) + ($(c[f + 120 >> 2] | 0, n) | 0) | 0;
                    q = c[f + 240 >> 2] | 0;
                    p = 1 << q + -1;
                    r = (h | 0) > 0;
                    if (r) {
                        o = g;
                        f = 0;
                        while (1) {
                            x = e[n + (f << 1) >> 1] | 0;
                            a[o >> 0] = ($(d[o >> 0] | 0, x) | 0) + p >> q;
                            y = o + 1 | 0;
                            a[y >> 0] = ($(d[y >> 0] | 0, x) | 0) + p >> q;
                            y = o + 2 | 0;
                            a[y >> 0] = ($(d[y >> 0] | 0, x) | 0) + p >> q;
                            f = f + 1 | 0;
                            if ((f | 0) == (h | 0)) break;
                            else o = o + m | 0
                        }
                    }
                    if (!((a[l >> 0] | 0) == 0 | r ^ 1)) {
                        g = g + 3 | 0;
                        f = 0;
                        while (1) {
                            a[g >> 0] = -1;
                            f = f + 1 | 0;
                            if ((f | 0) == (h | 0)) break;
                            else g = g + 4 | 0
                        }
                    }
                }
            while (0);
            c[j >> 2] = (c[j >> 2] | 0) + 1;
            y = 0;
            i = k;
            return y | 0
        }

        function Hd(a, d, f, g, h, j, k, l) {
            a = a | 0;
            d = d | 0;
            f = f | 0;
            g = g | 0;
            h = h | 0;
            j = j | 0;
            k = k | 0;
            l = l | 0;
            var m = 0,
                n = 0,
                o = 0,
                p = 0,
                q = 0,
                r = 0,
                s = 0,
                t = 0,
                u = 0,
                v = 0,
                w = 0,
                x = 0,
                y = 0,
                z = 0,
                A = 0;
            m = i;
            o = c[d + ((g + 5 & 7) << 2) >> 2] | 0;
            s = c[d + ((g + 6 & 7) << 2) >> 2] | 0;
            p = c[d + ((g + 7 & 7) << 2) >> 2] | 0;
            r = c[d + ((g & 7) << 2) >> 2] | 0;
            q = c[d + ((g + 1 & 7) << 2) >> 2] | 0;
            n = c[d + ((g + 2 & 7) << 2) >> 2] | 0;
            d = c[d + ((g + 3 & 7) << 2) >> 2] | 0;
            t = j + -8 | 0;
            u = 1 << t >> 1;
            g = (f + 1 | 0) / 2 | 0;
            v = (f | 0) > 0;
            if (!k) {
                if (v) {
                    k = 0;
                    do {
                        x = $(e[s + (k << 1) >> 1] | 0, -6) | 0;
                        y = $(e[q + (k << 1) >> 1] | 0, -10) | 0;
                        b[h + (k + 3 << 1) >> 1] = (e[o + (k << 1) >> 1] << 1) + u + x + ((e[p + (k << 1) >> 1] | 0) * 18 | 0) + ((e[r + (k << 1) >> 1] | 0) * 57 | 0) + y + (e[n + (k << 1) >> 1] << 2) - (e[d + (k << 1) >> 1] | 0) >> t;
                        k = k + 1 | 0
                    } while ((k | 0) < (g | 0))
                }
            } else if (v) {
                k = 0;
                do {
                    x = $(e[p + (k << 1) >> 1] | 0, -10) | 0;
                    y = $(e[n + (k << 1) >> 1] | 0, -6) | 0;
                    b[h + (k + 3 << 1) >> 1] = u - (e[o + (k << 1) >> 1] | 0) + (e[s + (k << 1) >> 1] << 2) + x + ((e[r + (k << 1) >> 1] | 0) * 57 | 0) + ((e[q + (k << 1) >> 1] | 0) * 18 | 0) + y + (e[d + (k << 1) >> 1] << 1) >> t;
                    k = k + 1 | 0
                } while ((k | 0) < (g | 0))
            }
            n = h + 6 | 0;
            y = b[n >> 1] | 0;
            b[h >> 1] = y;
            p = h + 2 | 0;
            b[p >> 1] = y;
            o = h + 4 | 0;
            b[o >> 1] = y;
            y = b[h + (g + 2 << 1) >> 1] | 0;
            b[h + (g + 3 << 1) >> 1] = y;
            b[h + (g + 4 << 1) >> 1] = y;
            b[h + (g + 5 << 1) >> 1] = y;
            b[h + (g + 6 << 1) >> 1] = y;
            g = (1 << j) + -1 | 0;
            if (!l) {
                o = 14 - j | 0;
                l = 1 << o >> 1;
                s = 20 - j | 0;
                r = 1 << s + -1;
                if ((f | 0) > 1) {
                    q = f + -2 | 0;
                    j = q >>> 1;
                    p = j << 1;
                    d = a;
                    while (1) {
                        t = (b[n >> 1] | 0) + l >> o;
                        if ((t | 0) < 0) t = 0;
                        else t = ((t | 0) > (g | 0) ? g : t) & 65535;
                        b[d >> 1] = t;
                        y = $((b[n + 4 >> 1] | 0) + (b[n + -2 >> 1] | 0) | 0, -11) | 0;
                        t = n;
                        n = n + 2 | 0;
                        t = r - (b[t + -6 >> 1] | 0) - (b[t + 8 >> 1] | 0) + ((b[t + 6 >> 1] | 0) + (b[t + -4 >> 1] | 0) << 2) + y + (((b[n >> 1] | 0) + (b[t >> 1] | 0) | 0) * 40 | 0) >> s;
                        if ((t | 0) < 0) t = 0;
                        else t = ((t | 0) > (g | 0) ? g : t) & 65535;
                        b[d + 2 >> 1] = t;
                        f = f + -2 | 0;
                        if ((f | 0) <= 1) break;
                        else d = d + 4 | 0
                    }
                    a = a + (p + 2 << 1) | 0;
                    f = q - p | 0;
                    n = h + (j + 4 << 1) | 0
                }
                if (!f) {
                    i = m;
                    return
                }
                h = (b[n >> 1] | 0) + l >> o;
                if ((h | 0) < 0) h = 0;
                else h = ((h | 0) > (g | 0) ? g : h) & 65535;
                b[a >> 1] = h;
                i = m;
                return
            } else {
                j = 20 - j | 0;
                l = 1 << j + -1;
                k = b[h >> 1] | 0;
                u = b[p >> 1] | 0;
                t = b[o >> 1] | 0;
                d = b[n >> 1] | 0;
                r = b[h + 8 >> 1] | 0;
                s = b[h + 10 >> 1] | 0;
                if ((f | 0) > 1) {
                    q = f + -2 | 0;
                    o = q >>> 1;
                    p = o << 1;
                    w = a;
                    while (1) {
                        v = b[n + 6 >> 1] | 0;
                        x = d * 57 | 0;
                        y = (s << 2) + l + ($(r, -10) | 0) + x + (t * 18 | 0) + ($(u, -6) | 0) + (k << 1) - v >> j;
                        if ((y | 0) < 0) y = 0;
                        else y = ((y | 0) > (g | 0) ? g : y) & 65535;
                        b[w >> 1] = y;
                        k = ($(s, -6) | 0) + l + (r * 18 | 0) + x + ($(t, -10) | 0) - k + (u << 2) + (v << 1) >> j;
                        if ((k | 0) < 0) k = 0;
                        else k = ((k | 0) > (g | 0) ? g : k) & 65535;
                        b[w + 2 >> 1] = k;
                        f = f + -2 | 0;
                        if ((f | 0) <= 1) break;
                        else {
                            A = s;
                            z = r;
                            x = d;
                            y = t;
                            k = u;
                            s = v;
                            w = w + 4 | 0;
                            n = n + 2 | 0;
                            r = A;
                            d = z;
                            t = x;
                            u = y
                        }
                    }
                    k = u;
                    u = t;
                    t = d;
                    d = r;
                    r = s;
                    s = v;
                    a = a + (p + 2 << 1) | 0;
                    f = q - p | 0;
                    n = h + (o + 4 << 1) | 0
                }
                if (!f) {
                    i = m;
                    return
                }
                h = (s << 2) + l + ($(r, -10) | 0) + (d * 57 | 0) + (t * 18 | 0) + ($(u, -6) | 0) + (k << 1) - (b[n + 6 >> 1] | 0) >> j;
                if ((h | 0) < 0) h = 0;
                else h = ((h | 0) > (g | 0) ? g : h) & 65535;
                b[a >> 1] = h;
                i = m;
                return
            }
        }

        function Id(a, c, d, f, g, h) {
            a = a | 0;
            c = c | 0;
            d = d | 0;
            f = f | 0;
            g = g | 0;
            h = h | 0;
            var j = 0,
                k = 0,
                l = 0,
                m = 0,
                n = 0,
                o = 0,
                p = 0,
                q = 0,
                r = 0,
                s = 0,
                t = 0,
                u = 0,
                v = 0,
                w = 0,
                x = 0;
            j = i;
            v = (d + 1 | 0) / 2 | 0;
            k = h + 6 | 0;
            fe(k | 0, c | 0, v << 1 | 0) | 0;
            u = b[c >> 1] | 0;
            b[h >> 1] = u;
            m = h + 2 | 0;
            b[m >> 1] = u;
            l = h + 4 | 0;
            b[l >> 1] = u;
            c = b[c + (v + -1 << 1) >> 1] | 0;
            b[h + (v + 3 << 1) >> 1] = c;
            b[h + (v + 4 << 1) >> 1] = c;
            b[h + (v + 5 << 1) >> 1] = c;
            b[h + (v + 6 << 1) >> 1] = c;
            c = (1 << f) + -1 | 0;
            if (!g) {
                if ((d | 0) > 1) {
                    g = d + -2 | 0;
                    l = g >>> 1;
                    m = l << 1;
                    f = a;
                    while (1) {
                        b[f >> 1] = b[k >> 1] | 0;
                        v = $((e[k + 4 >> 1] | 0) + (e[k + -2 >> 1] | 0) | 0, -11) | 0;
                        n = k;
                        k = k + 2 | 0;
                        n = 32 - (e[n + -6 >> 1] | 0) - (e[n + 8 >> 1] | 0) + ((e[n + 6 >> 1] | 0) + (e[n + -4 >> 1] | 0) << 2) + v + (((e[k >> 1] | 0) + (e[n >> 1] | 0) | 0) * 40 | 0) >> 6;
                        if ((n | 0) < 0) n = 0;
                        else n = ((n | 0) > (c | 0) ? c : n) & 65535;
                        b[f + 2 >> 1] = n;
                        d = d + -2 | 0;
                        if ((d | 0) <= 1) break;
                        else f = f + 4 | 0
                    }
                    a = a + (m + 2 << 1) | 0;
                    d = g - m | 0;
                    k = h + (l + 4 << 1) | 0
                }
                if (!d) {
                    i = j;
                    return
                }
                b[a >> 1] = b[k >> 1] | 0;
                i = j;
                return
            }
            r = e[h >> 1] | 0;
            f = e[m >> 1] | 0;
            q = e[l >> 1] | 0;
            p = e[k >> 1] | 0;
            o = e[h + 8 >> 1] | 0;
            n = e[h + 10 >> 1] | 0;
            if ((d | 0) > 1) {
                m = d + -2 | 0;
                l = m >>> 1;
                g = l << 1;
                t = a;
                while (1) {
                    s = e[k + 6 >> 1] | 0;
                    u = p * 57 | 0;
                    v = (n << 2) + 32 + ($(o, -10) | 0) + u + (q * 18 | 0) + ($(f, -6) | 0) + (r << 1) - s >> 6;
                    if ((v | 0) < 0) v = 0;
                    else v = ((v | 0) > (c | 0) ? c : v) & 65535;
                    b[t >> 1] = v;
                    r = ($(n, -6) | 0) + 32 + (o * 18 | 0) + u + ($(q, -10) | 0) - r + (f << 2) + (s << 1) >> 6;
                    if ((r | 0) < 0) r = 0;
                    else r = ((r | 0) > (c | 0) ? c : r) & 65535;
                    b[t + 2 >> 1] = r;
                    d = d + -2 | 0;
                    if ((d | 0) <= 1) break;
                    else {
                        x = n;
                        w = o;
                        u = p;
                        v = q;
                        r = f;
                        n = s;
                        t = t + 4 | 0;
                        k = k + 2 | 0;
                        o = x;
                        p = w;
                        q = u;
                        f = v
                    }
                }
                r = f;
                f = q;
                q = p;
                p = o;
                o = n;
                n = s;
                a = a + (g + 2 << 1) | 0;
                d = m - g | 0;
                k = h + (l + 4 << 1) | 0
            }
            if (!d) {
                i = j;
                return
            }
            h = (n << 2) + 32 + ($(o, -10) | 0) + (p * 57 | 0) + (q * 18 | 0) + ($(f, -6) | 0) + (r << 1) - (e[k + 6 >> 1] | 0) >> 6;
            if ((h | 0) < 0) h = 0;
            else h = ((h | 0) > (c | 0) ? c : h) & 65535;
            b[a >> 1] = h;
            i = j;
            return
        }

        function Jd() {
            var a = 0,
                b = 0;
            a = i;
            b = md(252) | 0;
            if (!b) b = 0;
            i = a;
            return b | 0
        }

        function Kd(e, f, g) {
            e = e | 0;
            f = f | 0;
            g = g | 0;
            var h = 0,
                j = 0,
                k = 0,
                l = 0,
                m = 0,
                n = 0,
                o = 0,
                p = 0,
                q = 0,
                r = 0,
                s = 0,
                t = 0,
                u = 0,
                v = 0,
                w = 0,
                x = 0,
                y = 0,
                z = 0,
                A = 0,
                B = 0,
                C = 0,
                D = 0,
                E = 0,
                F = 0,
                G = 0,
                H = 0,
                I = 0,
                J = 0,
                K = 0,
                L = 0,
                M = 0,
                N = 0,
                O = 0,
                P = 0,
                Q = 0,
                R = 0;
            k = i;
            i = i + 80 | 0;
            n = k + 72 | 0;
            l = k + 60 | 0;
            h = k + 48 | 0;
            u = k + 44 | 0;
            x = k + 40 | 0;
            t = k + 36 | 0;
            p = k;
            y = a[e + 40 >> 0] | 0;
            a: do
                if (((((((g | 0) >= 6 ? (a[f >> 0] | 0) == 66 : 0) ? (a[f + 1 >> 0] | 0) == 80 : 0) ? (a[f + 2 >> 0] | 0) == 71 : 0) ? (a[f + 3 >> 0] | 0) == -5 : 0) ? (R = a[f + 4 >> 0] | 0, N = R & 255, J = N >>> 5, c[p + 8 >> 2] = J, (R & 255) <= 191) : 0) ? (R = (N & 15) + 8 | 0, a[p + 13 >> 0] = R, (R & 255) >>> 0 <= 14) : 0) {
                    L = a[f + 5 >> 0] | 0;
                    v = L & 255;
                    M = v >>> 4;
                    c[p + 24 >> 2] = M;
                    A = v & 8;
                    R = v >>> 2 & 1;
                    a[p + 16 >> 0] = v >>> 1 & 1;
                    r = p + 17 | 0;
                    a[r >> 0] = v & 1;
                    v = p + 18 | 0;
                    b[v >> 1] = 0;
                    s = p + 20 | 0;
                    b[s >> 1] = 0;
                    w = p + 22 | 0;
                    b[w >> 1] = 0;
                    O = p + 12 | 0;
                    a[O >> 0] = 0;
                    Q = p + 14 | 0;
                    a[Q >> 0] = 0;
                    P = p + 15 | 0;
                    a[P >> 0] = 0;
                    if (!(N & 16))
                        if (!R) N = 0;
                        else {
                            a[O >> 0] = 1;
                            a[Q >> 0] = 1;
                            N = 1
                        } else {
                        a[O >> 0] = 1;
                        a[P >> 0] = R;
                        N = 0
                    }
                    if ((((((((((L & 255) <= 79 ? (J | 0) != 0 | (M | 0) == 0 : 0) ? !(N << 24 >> 24 != 0 & (J | 0) == 0) : 0) ? (F = Qd(p, f + 6 | 0, g + -6 | 0) | 0, (F | 0) >= 0) : 0) ? (C = (c[p >> 2] | 0) >>> 0 > 1073741823 ? -1 : F, (C | 0) >= 0) : 0) ? (E = C + 6 | 0, z = p + 4 | 0, I = Qd(z, f + E | 0, g - E | 0) | 0, (I | 0) >= 0) : 0) ? (H = c[z >> 2] | 0, D = H >>> 0 > 1073741823 ? -1 : I, (D | 0) >= 0) : 0) ? (G = D + E | 0, !((c[p >> 2] | 0) == 0 | (H | 0) == 0)) : 0) ? (q = p + 28 | 0, K = Qd(q, f + G | 0, g - G | 0) | 0, (K | 0) >= 0) : 0) ? (B = (c[q >> 2] | 0) >>> 0 > 1073741823 ? -1 : K, (B | 0) >= 0) : 0) {
                        z = B + G | 0;
                        c[n >> 2] = 0;
                        do
                            if (!A) {
                                c[p + 32 >> 2] = 0;
                                m = 48
                            } else {
                                A = Qd(n, f + z | 0, g - z | 0) | 0;
                                if ((A | 0) < 0) {
                                    z = -1;
                                    break a
                                }
                                B = c[n >> 2] | 0;
                                A = B >>> 0 > 1073741823 ? -1 : A;
                                if ((A | 0) < 0) {
                                    z = -1;
                                    break a
                                }
                                C = A + z | 0;
                                A = p + 32 | 0;
                                c[A >> 2] = 0;
                                z = C + B | 0;
                                if ((z | 0) > (g | 0)) {
                                    z = -1;
                                    break a
                                }
                                y = y << 24 >> 24 != 0;
                                if (!y ? (a[r >> 0] | 0) == 0 : 0) break;
                                if ((C | 0) >= (z | 0)) {
                                    z = C;
                                    m = 48;
                                    break
                                }
                                while (1) {
                                    B = Qd(l, f + C | 0, z - C | 0) | 0;
                                    if ((B | 0) < 0) {
                                        z = -1;
                                        break a
                                    }
                                    C = B + C | 0;
                                    D = Qd(h, f + C | 0, z - C | 0) | 0;
                                    if ((D | 0) < 0) {
                                        z = -1;
                                        break a
                                    }
                                    B = c[h >> 2] | 0;
                                    D = B >>> 0 > 1073741823 ? -1 : D;
                                    if ((D | 0) < 0) {
                                        z = -1;
                                        break a
                                    }
                                    D = D + C | 0;
                                    C = D + B | 0;
                                    if (C >>> 0 > z >>> 0) {
                                        z = -1;
                                        break a
                                    }
                                    do
                                        if (a[r >> 0] | 0) {
                                            if ((c[l >> 2] | 0) != 5) break;
                                            F = Qd(u, f + D | 0, z - D | 0) | 0;
                                            if ((F | 0) < 0) {
                                                z = -1;
                                                break a
                                            }
                                            E = c[u >> 2] | 0;
                                            F = E >>> 0 > 1073741823 ? -1 : F;
                                            if ((F | 0) < 0) {
                                                z = -1;
                                                break a
                                            }
                                            G = F + D | 0;
                                            H = Qd(x, f + G | 0, z - G | 0) | 0;
                                            if ((H | 0) < 0) {
                                                z = -1;
                                                break a
                                            }
                                            F = c[x >> 2] | 0;
                                            H = F >>> 0 > 1073741823 ? -1 : H;
                                            if ((H | 0) < 0) {
                                                z = -1;
                                                break a
                                            }
                                            R = H + G | 0;
                                            if ((Qd(t, f + R | 0, z - R | 0) | 0) < 0) {
                                                z = -1;
                                                break a
                                            }
                                            G = c[t >> 2] | 0;
                                            if (!((F & 65535 | 0) == (F | 0) & ((G >>> 0 > 1073741823 | (F | 0) == 0 | (G | 0) == 0) ^ 1))) {
                                                z = -1;
                                                break a
                                            }
                                            if ((G & 65535 | 0) != (G | 0)) {
                                                z = -1;
                                                break a
                                            }
                                            if ((E & 65535 | 0) != (E | 0)) {
                                                z = -1;
                                                break a
                                            }
                                            b[v >> 1] = E;
                                            b[s >> 1] = F;
                                            b[w >> 1] = G
                                        }
                                    while (0);
                                    if (y) {
                                        P = fd(16) | 0;
                                        c[P >> 2] = c[l >> 2];
                                        Q = P + 4 | 0;
                                        c[Q >> 2] = B;
                                        R = P + 12 | 0;
                                        c[R >> 2] = 0;
                                        c[A >> 2] = P;
                                        A = fd(B) | 0;
                                        c[P + 8 >> 2] = A;
                                        fe(A | 0, f + D | 0, c[Q >> 2] | 0) | 0;
                                        A = R
                                    }
                                    if ((C | 0) >= (z | 0)) {
                                        z = C;
                                        m = 48;
                                        break
                                    }
                                }
                            }
                        while (0);
                        do
                            if ((m | 0) == 48) {
                                if (!(a[r >> 0] | 0)) break;
                                if (!(b[s >> 1] | 0)) {
                                    z = -1;
                                    break a
                                }
                            }
                        while (0);
                        if (c[q >> 2] | 0) break;
                        c[q >> 2] = g - z
                    } else z = -1
                } else z = -1;
            while (0);
            if ((z | 0) < 0) {
                R = z;
                i = k;
                return R | 0
            }
            u = c[p >> 2] | 0;
            v = c[p + 4 >> 2] | 0;
            B = c[p + 12 >> 2] | 0;
            y = B & 255;
            A = c[p + 24 >> 2] | 0;
            w = (B & 65535) >>> 8;
            t = w & 255;
            w = w & 65535;
            q = e + 16 | 0;
            c[q >> 2] = u;
            r = e + 20 | 0;
            c[r >> 2] = v;
            x = c[p + 8 >> 2] | 0;
            C = e + 24 | 0;
            c[C >> 2] = x;
            s = B >>> 24 & 255;
            B = B >>> 16 & 255;
            if ((x | 0) == 4) {
                c[C >> 2] = 1;
                a[e + 28 >> 0] = 0;
                x = 1
            } else if ((x | 0) == 5) {
                c[C >> 2] = 2;
                a[e + 28 >> 0] = 0;
                x = 2
            } else {
                c[C >> 2] = x;
                a[e + 28 >> 0] = 1
            }
            a[e + 29 >> 0] = y;
            a[e + 33 >> 0] = s;
            a[e + 31 >> 0] = B;
            s = c[p + 16 >> 2] | 0;
            a[e + 32 >> 0] = s;
            c[e + 36 >> 2] = A;
            a[e + 30 >> 0] = t;
            a[e + 34 >> 0] = (s & 65535) >>> 8;
            b[e + 48 >> 1] = s >>> 16;
            s = c[p + 20 >> 2] | 0;
            b[e + 50 >> 1] = s;
            b[e + 52 >> 1] = s >>> 16;
            s = e + 44 | 0;
            c[s >> 2] = c[p + 32 >> 2];
            do
                if (((c[p + 28 >> 2] | 0) + z | 0) >>> 0 <= g >>> 0) {
                    A = f + z | 0;
                    g = g - z | 0;
                    c[l >> 2] = 0;
                    c[l + 4 >> 2] = 0;
                    p = l + 8 | 0;
                    c[p >> 2] = 0;
                    c[h >> 2] = 0;
                    c[h + 4 >> 2] = 0;
                    t = h + 8 | 0;
                    c[t >> 2] = 0;
                    if (!(y << 24 >> 24)) {
                        z = A;
                        y = g
                    } else {
                        y = Nd(l, e + 12 | 0, e + 4 | 0, A, g, u, v, 0, w) | 0;
                        if ((y | 0) < 0) break;
                        z = f + (y + z) | 0;
                        y = g - y | 0
                    }
                    f = e + 8 | 0;
                    A = Nd(h, f, e, z, y, u, v, x, w) | 0;
                    if ((A | 0) >= 0) {
                        u = y - A | 0;
                        v = e + 4 | 0;
                        y = c[v >> 2] | 0;
                        w = (y | 0) != 0;
                        c[n >> 2] = 0;
                        x = n + 4 | 0;
                        c[x >> 2] = 0;
                        b: do
                            if ((u | 0) > 0) {
                                y = n + ((w & 1) << 2) | 0;
                                D = 0;
                                H = 0;
                                z = z + A | 0;
                                A = u;
                                G = 1;
                                c: while (1) {
                                    B = (G | 0) != 0;
                                    if ((A | 0) < ((B ? 5 : 2) | 0)) {
                                        n = -1;
                                        break b
                                    }
                                    if (B) F = 0;
                                    else F = (a[z + 2 >> 0] | 0) == 0 ? 4 : 3;
                                    if ((A | 0) < (F + 3 | 0)) {
                                        n = -1;
                                        break b
                                    }
                                    C = z + F | 0;
                                    B = d[C >> 0] | 0;
                                    E = B << 5 & 32 | (d[z + (F + 1) >> 0] | 0) >>> 3;
                                    B = B >>> 1 & 63;
                                    do
                                        if ((B + -32 | 0) >>> 0 < 4 | (B | 0) == 39 | B >>> 0 > 40)
                                            if (D)
                                                if (!(c[y >> 2] | 0)) B = H;
                                                else break c;
                                    else {
                                        B = H;
                                        D = 0
                                    } else if ((B >>> 0 < 10 | (B + -16 | 0) >>> 0 < 6 ? (o = F + 2 | 0, (o | 0) < (A | 0)) : 0) ? (a[z + o >> 0] | 0) < 0 : 0) {
                                        if ((H | 0) != 0 ? (c[y >> 2] | 0) != 0 : 0) break c;
                                        if (w & (E | 0) == 1) {
                                            c[x >> 2] = 1;
                                            B = H;
                                            D = H;
                                            break
                                        } else {
                                            c[n >> 2] = 1;
                                            B = 1;
                                            D = 1;
                                            break
                                        }
                                    } else B = H;
                                    while (0);
                                    do
                                        if ((G | 0) != 1) {
                                            if (((((A | 0) > 3 ? (a[z >> 0] | 0) == 0 : 0) ? (a[z + 1 >> 0] | 0) == 0 : 0) ? (a[z + 2 >> 0] | 0) == 0 : 0) ? (a[z + 3 >> 0] | 0) == 1 : 0) {
                                                G = 4;
                                                break
                                            }
                                            if ((A | 0) <= 2) {
                                                n = -1;
                                                break b
                                            }
                                            if (a[z >> 0] | 0) {
                                                n = -1;
                                                break b
                                            }
                                            if (a[z + 1 >> 0] | 0) {
                                                n = -1;
                                                break b
                                            }
                                            if ((a[z + 2 >> 0] | 0) == 1) G = 3;
                                            else {
                                                n = -1;
                                                break b
                                            }
                                        } else G = 0;
                                    while (0);
                                    H = G + 2 | 0;
                                    if ((H | 0) > (A | 0)) {
                                        n = -1;
                                        break b
                                    }
                                    d: do
                                        if ((H | 0) < (A | 0))
                                            while (1) {
                                                K = (a[z + G >> 0] | 0) == 0;
                                                do
                                                    if (K) {
                                                        if (a[z + (G + 1) >> 0] | 0) break;
                                                        if ((a[z + H >> 0] | 0) == 1) break d
                                                    }
                                                while (0);
                                                J = H;
                                                H = G + 3 | 0;
                                                if ((H | 0) >= (A | 0)) {
                                                    G = A;
                                                    break d
                                                }
                                                I = G + 1 | 0;
                                                if (!K) {
                                                    G = I;
                                                    continue
                                                }
                                                if (a[z + I >> 0] | 0) {
                                                    G = I;
                                                    continue
                                                }
                                                if (a[z + J >> 0] | 0) {
                                                    G = I;
                                                    continue
                                                }
                                                J = (a[z + H >> 0] | 0) == 1;
                                                if (J) {
                                                    G = J ? G : A;
                                                    break
                                                } else G = I
                                            } else G = A;
                                    while (0);
                                    if ((G | 0) < 0) {
                                        n = -1;
                                        break b
                                    }
                                    H = G - F | 0;
                                    F = H + 3 | 0;
                                    E = w & (E | 0) == 1;
                                    J = E ? l : h;
                                    I = J + 8 | 0;
                                    if ((Od(J, (c[I >> 2] | 0) + F | 0) | 0) < 0) {
                                        n = -1;
                                        break b
                                    }
                                    K = c[J >> 2] | 0;
                                    J = c[I >> 2] | 0;
                                    a[K + J >> 0] = 0;
                                    a[K + (J + 1) >> 0] = 0;
                                    a[K + (J + 2) >> 0] = 1;
                                    fe(K + (J + 3) | 0, C | 0, H | 0) | 0;
                                    if (E) {
                                        R = K + (J + 4) | 0;
                                        a[R >> 0] = d[R >> 0] & 7
                                    }
                                    c[I >> 2] = J + F;
                                    A = A - G | 0;
                                    if ((A | 0) > 0) {
                                        H = B;
                                        z = z + G | 0;
                                        G = 0
                                    } else break
                                }
                                y = c[v >> 2] | 0;
                                m = 105
                            } else {
                                A = u;
                                m = 105
                            }
                        while (0);
                        do
                            if ((m | 0) == 105) {
                                if (y) {
                                    if ((Od(l, (c[p >> 2] | 0) + 32 | 0) | 0) < 0) {
                                        n = -1;
                                        break
                                    }
                                    if ((Pd(c[v >> 2] | 0, c[e + 12 >> 2] | 0, c[l >> 2] | 0, c[p >> 2] | 0) | 0) < 0) {
                                        n = -1;
                                        break
                                    }
                                }
                                if ((Od(h, (c[t >> 2] | 0) + 32 | 0) | 0) < 0) n = -1;
                                else {
                                    n = (Pd(c[e >> 2] | 0, c[f >> 2] | 0, c[h >> 2] | 0, c[t >> 2] | 0) | 0) < 0;
                                    n = n ? -1 : u - A | 0
                                }
                            }
                        while (0);
                        id(c[l >> 2] | 0);
                        id(c[h >> 2] | 0);
                        if ((((n | 0) >= 0 ? (g - u + n | 0) >= 0 : 0) ? (Ld(e), j = c[f >> 2] | 0, (c[j + 64 >> 2] | 0) >= (c[q >> 2] | 0)) : 0) ? (c[j + 68 >> 2] | 0) >= (c[r >> 2] | 0) : 0) {
                            c[e + 80 >> 2] = -1;
                            R = 0;
                            i = k;
                            return R | 0
                        }
                    }
                }
            while (0);
            xd(e + 8 | 0);
            xd(e + 12 | 0);
            c[s >> 2] = 0;
            R = -1;
            i = k;
            return R | 0
        }

        function Ld(a) {
            a = a | 0;
            var b = 0,
                d = 0,
                e = 0;
            b = i;
            d = a + 4 | 0;
            e = c[d >> 2] | 0;
            if (e) {
                Jc(e) | 0;
                id(c[d >> 2] | 0);
                c[d >> 2] = 0
            }
            d = c[a >> 2] | 0;
            if (!d) {
                i = b;
                return
            }
            Jc(d) | 0;
            id(c[a >> 2] | 0);
            c[a >> 2] = 0;
            i = b;
            return
        }

        function Md(a) {
            a = a | 0;
            var b = 0,
                d = 0;
            b = i;
            id(c[a + 124 >> 2] | 0);
            id(c[a + 128 >> 2] | 0);
            d = 0;
            do {
                id(c[a + (d << 2) + 132 >> 2] | 0);
                id(c[a + (d << 2) + 164 >> 2] | 0);
                d = d + 1 | 0
            } while ((d | 0) != 8);
            id(c[a + 196 >> 2] | 0);
            id(c[a + 56 >> 2] | 0);
            Ld(a);
            xd(a + 8 | 0);
            xd(a + 12 | 0);
            id(a);
            i = b;
            return
        }

        function Nd(b, d, e, f, g, h, j, k, l) {
            b = b | 0;
            d = d | 0;
            e = e | 0;
            f = f | 0;
            g = g | 0;
            h = h | 0;
            j = j | 0;
            k = k | 0;
            l = l | 0;
            var m = 0,
                n = 0,
                o = 0,
                p = 0,
                q = 0,
                r = 0,
                s = 0,
                t = 0;
            n = i;
            i = i + 16 | 0;
            q = n + 4 | 0;
            m = n;
            p = Qd(q, f, g) | 0;
            if ((p | 0) < 0) {
                t = -1;
                i = n;
                return t | 0
            }
            r = c[q >> 2] | 0;
            t = r >>> 0 > 1073741823 ? -1 : p;
            if ((t | 0) < 0) {
                t = -1;
                i = n;
                return t | 0
            }
            s = g - t | 0;
            if (r >>> 0 > s >>> 0) {
                t = -1;
                i = n;
                return t | 0
            }
            q = r + 10 | 0;
            p = fd(q) | 0;
            a[p >> 0] = k;
            a[p + 1 >> 0] = h >>> 24;
            a[p + 2 >> 0] = h >>> 16;
            a[p + 3 >> 0] = h >>> 8;
            a[p + 4 >> 0] = h;
            a[p + 5 >> 0] = j >>> 24;
            a[p + 6 >> 0] = j >>> 16;
            a[p + 7 >> 0] = j >>> 8;
            a[p + 8 >> 0] = j;
            a[p + 9 >> 0] = l + 248;
            fe(p + 10 | 0, f + t | 0, r | 0) | 0;
            l = s - r | 0;
            k = fd(10 - r + (q << 1) + l | 0) | 0;
            a[k >> 0] = 0;
            a[k + 1 >> 0] = 0;
            a[k + 2 >> 0] = 0;
            a[k + 3 >> 0] = 1;
            a[k + 4 >> 0] = 96;
            a[k + 5 >> 0] = 1;
            if ((q | 0) > 0) {
                r = 0;
                f = 6;
                do {
                    j = r + 1 | 0;
                    h = a[p + r >> 0] | 0;
                    if ((j | 0) < (q | 0) & h << 24 >> 24 == 0)
                        if (!(a[p + j >> 0] | 0)) {
                            a[k + f >> 0] = 0;
                            a[k + (f + 1) >> 0] = 0;
                            a[k + (f + 2) >> 0] = 3;
                            r = r + 2 | 0;
                            f = f + 3 | 0
                        } else {
                            h = 0;
                            o = 8
                        } else o = 8;
                    if ((o | 0) == 8) {
                        o = 0;
                        a[k + f >> 0] = h;
                        r = j;
                        f = f + 1 | 0
                    }
                } while ((r | 0) < (q | 0));
                if (!f) {
                    f = 0;
                    o = 12
                } else o = 11
            } else {
                f = 6;
                o = 11
            }
            if ((o | 0) == 11)
                if (!(a[k + (f + -1) >> 0] | 0)) o = 12;
            if ((o | 0) == 12) {
                a[k + f >> 0] = -128;
                f = f + 1 | 0
            }
            id(p);
            o = g - l | 0;
            if ((o | 0) < 0) {
                t = -1;
                i = n;
                return t | 0
            }
            g = b + 8 | 0;
            if ((Od(b, (c[g >> 2] | 0) + f | 0) | 0) < 0) {
                id(k);
                t = -1;
                i = n;
                return t | 0
            }
            fe((c[b >> 2] | 0) + (c[g >> 2] | 0) | 0, k | 0, f | 0) | 0;
            c[g >> 2] = (c[g >> 2] | 0) + f;
            id(k);
            b = Oc(1416) | 0;
            if (!b) {
                t = -1;
                i = n;
                return t | 0
            }
            g = wd() | 0;
            c[m >> 2] = g;
            if (!g) {
                t = -1;
                i = n;
                return t | 0
            }
            t = b + 688 | 0;
            c[t >> 2] = c[t >> 2] | 1;
            if ((Ic(b, 1416, 0) | 0) < 0) {
                xd(m);
                t = -1;
                i = n;
                return t | 0
            } else {
                c[e >> 2] = b;
                c[d >> 2] = g;
                t = o;
                i = n;
                return t | 0
            }
            return 0
        }

        function Od(a, b) {
            a = a | 0;
            b = b | 0;
            var d = 0,
                e = 0,
                f = 0;
            d = i;
            e = a + 4 | 0;
            f = c[e >> 2] | 0;
            if ((f | 0) < (b | 0)) {
                f = (f * 3 | 0) / 2 | 0;
                f = (f | 0) < (b | 0) ? b : f;
                b = gd(c[a >> 2] | 0, f) | 0;
                if (!b) a = -1;
                else {
                    c[a >> 2] = b;
                    c[e >> 2] = f;
                    a = 0
                }
            } else a = 0;
            i = d;
            return a | 0
        }

        function Pd(b, d, e, f) {
            b = b | 0;
            d = d | 0;
            e = e | 0;
            f = f | 0;
            var g = 0,
                h = 0,
                j = 0;
            j = i;
            i = i + 96 | 0;
            h = j;
            g = j + 80 | 0;
            Xc(h);
            c[h + 24 >> 2] = e;
            c[h + 28 >> 2] = f;
            e = e + f + 0 | 0;
            f = e + 32 | 0;
            do {
                a[e >> 0] = 0;
                e = e + 1 | 0
            } while ((e | 0) < (f | 0));
            e = (Pc(b, d, g, h) | 0) < 0;
            i = j;
            return (e | (c[g >> 2] | 0) == 0) << 31 >> 31 | 0
        }

        function Qd(b, e, f) {
            b = b | 0;
            e = e | 0;
            f = f | 0;
            var g = 0,
                h = 0,
                j = 0,
                k = 0;
            g = i;
            a: do
                if ((f | 0) >= 1) {
                    j = a[e >> 0] | 0;
                    h = j & 255;
                    if (j << 24 >> 24 > -1) {
                        c[b >> 2] = h;
                        b = 1;
                        break
                    }
                    if (j << 24 >> 24 != -128) {
                        j = e + 1 | 0;
                        h = h & 127;
                        while (1) {
                            if ((f | 0) < 2) {
                                b = -1;
                                break a
                            }
                            k = j;
                            j = j + 1 | 0;
                            k = d[k >> 0] | 0;
                            h = k & 127 | h << 7;
                            if (!(k & 128)) break;
                            else f = f + -1 | 0
                        }
                        c[b >> 2] = h;
                        b = j - e | 0
                    } else b = -1
                } else b = -1;
            while (0);
            i = g;
            return b | 0
        }

        function Rd(d, f, g, h, j, k, l) {
            d = d | 0;
            f = f | 0;
            g = g | 0;
            h = h | 0;
            j = j | 0;
            k = k | 0;
            l = l | 0;
            var m = 0,
                n = 0,
                o = 0;
            j = i;
            if ((c[d + 40 >> 2] | 0) == 8 ? (c[d + 44 >> 2] | 0) == 0 : 0) {
                if ((k | 0) > 0) h = 0;
                else {
                    i = j;
                    return
                }
                while (1) {
                    o = b[g + (h << 1) >> 1] & 255;
                    a[f >> 0] = o;
                    a[f + 1 >> 0] = o;
                    a[f + 2 >> 0] = o;
                    h = h + 1 | 0;
                    if ((h | 0) == (k | 0)) break;
                    else f = f + l | 0
                }
                i = j;
                return
            }
            m = c[d + 12 >> 2] | 0;
            h = c[d + 16 >> 2] | 0;
            d = c[d >> 2] | 0;
            if ((k | 0) > 0) n = 0;
            else {
                i = j;
                return
            }
            while (1) {
                o = ($(e[g + (n << 1) >> 1] | 0, m) | 0) + h >> d;
                if ((o | 0) < 0) o = 0;
                else o = (o | 0) > 255 ? -1 : o & 255;
                a[f >> 0] = o;
                a[f + 1 >> 0] = o;
                a[f + 2 >> 0] = o;
                n = n + 1 | 0;
                if ((n | 0) == (k | 0)) break;
                else f = f + l | 0
            }
            i = j;
            return
        }

        function Sd(b, d, f, g, h, j, k) {
            b = b | 0;
            d = d | 0;
            f = f | 0;
            g = g | 0;
            h = h | 0;
            j = j | 0;
            k = k | 0;
            var l = 0,
                m = 0,
                n = 0,
                o = 0,
                p = 0,
                q = 0,
                r = 0,
                s = 0,
                t = 0,
                u = 0,
                v = 0,
                w = 0,
                x = 0;
            q = i;
            s = c[b + 20 >> 2] | 0;
            n = c[b + 24 >> 2] | 0;
            o = c[b + 28 >> 2] | 0;
            l = c[b + 32 >> 2] | 0;
            p = c[b + 12 >> 2] | 0;
            r = c[b + 16 >> 2] | 0;
            m = c[b >> 2] | 0;
            b = c[b + 36 >> 2] | 0;
            if ((j | 0) > 0) t = 0;
            else {
                i = q;
                return
            }
            while (1) {
                v = $(e[f + (t << 1) >> 1] | 0, p) | 0;
                u = (e[g + (t << 1) >> 1] | 0) - b | 0;
                w = (e[h + (t << 1) >> 1] | 0) - b | 0;
                v = v + r | 0;
                x = v + ($(w, s) | 0) >> m;
                if ((x | 0) < 0) x = 0;
                else x = (x | 0) > 255 ? -1 : x & 255;
                a[d >> 0] = x;
                w = v - ($(u, n) | 0) - ($(w, o) | 0) >> m;
                if ((w | 0) < 0) w = 0;
                else w = (w | 0) > 255 ? -1 : w & 255;
                a[d + 1 >> 0] = w;
                u = v + ($(u, l) | 0) >> m;
                if ((u | 0) < 0) u = 0;
                else u = (u | 0) > 255 ? -1 : u & 255;
                a[d + 2 >> 0] = u;
                t = t + 1 | 0;
                if ((t | 0) == (j | 0)) break;
                else d = d + k | 0
            }
            i = q;
            return
        }

        function Td(d, f, g, h, j, k, l) {
            d = d | 0;
            f = f | 0;
            g = g | 0;
            h = h | 0;
            j = j | 0;
            k = k | 0;
            l = l | 0;
            var m = 0,
                n = 0,
                o = 0,
                p = 0,
                q = 0;
            m = i;
            if ((c[d + 40 >> 2] | 0) == 8 ? (c[d + 44 >> 2] | 0) == 0 : 0) {
                if ((k | 0) > 0) n = 0;
                else {
                    i = m;
                    return
                }
                while (1) {
                    a[f >> 0] = b[j + (n << 1) >> 1];
                    a[f + 1 >> 0] = b[g + (n << 1) >> 1];
                    a[f + 2 >> 0] = b[h + (n << 1) >> 1];
                    n = n + 1 | 0;
                    if ((n | 0) == (k | 0)) break;
                    else f = f + l | 0
                }
                i = m;
                return
            }
            o = c[d + 12 >> 2] | 0;
            n = c[d + 16 >> 2] | 0;
            d = c[d >> 2] | 0;
            if ((k | 0) > 0) p = 0;
            else {
                i = m;
                return
            }
            while (1) {
                q = ($(e[j + (p << 1) >> 1] | 0, o) | 0) + n >> d;
                if ((q | 0) < 0) q = 0;
                else q = (q | 0) > 255 ? -1 : q & 255;
                a[f >> 0] = q;
                q = ($(e[g + (p << 1) >> 1] | 0, o) | 0) + n >> d;
                if ((q | 0) < 0) q = 0;
                else q = (q | 0) > 255 ? -1 : q & 255;
                a[f + 1 >> 0] = q;
                q = ($(e[h + (p << 1) >> 1] | 0, o) | 0) + n >> d;
                if ((q | 0) < 0) q = 0;
                else q = (q | 0) > 255 ? -1 : q & 255;
                a[f + 2 >> 0] = q;
                p = p + 1 | 0;
                if ((p | 0) == (k | 0)) break;
                else f = f + l | 0
            }
            i = m;
            return
        }

        function Ud(b, d, f, g, h, j, k) {
            b = b | 0;
            d = d | 0;
            f = f | 0;
            g = g | 0;
            h = h | 0;
            j = j | 0;
            k = k | 0;
            var l = 0,
                m = 0,
                n = 0,
                o = 0,
                p = 0,
                q = 0,
                r = 0,
                s = 0,
                t = 0,
                u = 0;
            o = i;
            l = c[b + 12 >> 2] | 0;
            m = c[b + 16 >> 2] | 0;
            n = c[b >> 2] | 0;
            b = c[b + 36 >> 2] | 0;
            if ((j | 0) > 0) p = 0;
            else {
                i = o;
                return
            }
            while (1) {
                t = e[f + (p << 1) >> 1] | 0;
                s = (e[g + (p << 1) >> 1] | 0) - b | 0;
                r = (e[h + (p << 1) >> 1] | 0) - b | 0;
                q = t - s | 0;
                u = ($(q + r | 0, l) | 0) + m >> n;
                if ((u | 0) < 0) u = 0;
                else u = (u | 0) > 255 ? -1 : u & 255;
                a[d >> 0] = u;
                s = ($(s + t | 0, l) | 0) + m >> n;
                if ((s | 0) < 0) s = 0;
                else s = (s | 0) > 255 ? -1 : s & 255;
                a[d + 1 >> 0] = s;
                q = ($(q - r | 0, l) | 0) + m >> n;
                if ((q | 0) < 0) q = 0;
                else q = (q | 0) > 255 ? -1 : q & 255;
                a[d + 2 >> 0] = q;
                p = p + 1 | 0;
                if ((p | 0) == (j | 0)) break;
                else d = d + k | 0
            }
            i = o;
            return
        }

        function Vd(b) {
            b = b | 0;
            var d = 0,
                e = 0,
                f = 0,
                g = 0,
                h = 0,
                j = 0,
                k = 0;
            d = i;
            if ((b | 0) == 0 | b >>> 0 > 2147483583) {
                k = 0;
                i = d;
                return k | 0
            }
            do
                if (!(c[1523] | 0)) {
                    e = ra(64) | 0;
                    if ((e | 0) == (-1 | 0)) {
                        k = 0;
                        i = d;
                        return k | 0
                    } else {
                        c[1524] = ra(0) | 0;
                        c[1523] = 6088;
                        c[1522] = 6088;
                        c[1527] = 6104;
                        c[1526] = 6104;
                        k = e + 16 | 0;
                        a[e + 15 >> 0] = -86;
                        j = c[1527] | 0;
                        c[1527] = k;
                        c[k >> 2] = 6104;
                        c[e + 20 >> 2] = j;
                        c[j >> 2] = k;
                        j = e + 24 | 0;
                        k = c[1523] | 0;
                        c[1523] = j;
                        c[j >> 2] = 6088;
                        c[e + 28 >> 2] = k;
                        c[k >> 2] = j;
                        break
                    }
                }
            while (0);
            e = b + 40 & -32;
            h = c[1524] | 0;
            g = c[1522] | 0;
            k = 6092 | 0;
            while (1) {
                f = c[k >> 2] | 0;
                b = f + -8 | 0;
                k = c[f + -4 >> 2] | 0;
                if ((k | 0) == 6104) j = h;
                else j = k;
                j = j - b | 0;
                if (e >>> 0 < j >>> 0) {
                    h = 12;
                    break
                }
                if ((f | 0) == (g | 0)) {
                    h = 10;
                    break
                }
                k = f + 4 | 0;
                if ((e | 0) == (j | 0)) {
                    h = 15;
                    break
                }
            }
            do
                if ((h | 0) == 10)
                    if ((ra(e + 32 - j | 0) | 0) == (-1 | 0)) {
                        k = 0;
                        i = d;
                        return k | 0
                    } else {
                        c[1524] = ra(0) | 0;
                        k = c[g + -4 >> 2] | 0;
                        f = g;
                        h = 12;
                        break
                    } else
            if ((h | 0) == 15) {
                j = c[f >> 2] | 0;
                k = c[k >> 2] | 0;
                c[j + 4 >> 2] = k;
                c[k >> 2] = j
            }
            while (0);
            if ((h | 0) == 12) {
                h = b + e | 0;
                c[f + -4 >> 2] = h;
                c[h >> 2] = b;
                c[b + (e | 4) >> 2] = k;
                c[k >> 2] = h;
                h = b + (e | 8) | 0;
                k = f + 4 | 0;
                j = c[k >> 2] | 0;
                c[k >> 2] = h;
                c[h >> 2] = f;
                c[b + (e | 12) >> 2] = j;
                c[j >> 2] = h;
                a[b + (e + -1) >> 0] = -86;
                j = c[f >> 2] | 0;
                k = c[k >> 2] | 0;
                c[j + 4 >> 2] = k;
                c[k >> 2] = j
            }
            a[b + -1 >> 0] = 85;
            k = f;
            i = d;
            return k | 0
        }

        function Wd(b) {
            b = b | 0;
            var d = 0,
                e = 0,
                f = 0,
                g = 0,
                h = 0,
                j = 0;
            d = i;
            if (!b) {
                i = d;
                return
            }
            g = b + -8 | 0;
            e = c[1523] | 0;
            c[1523] = b;
            c[b >> 2] = 6088;
            f = b + 4 | 0;
            c[f >> 2] = e;
            c[e >> 2] = b;
            a[b + -9 >> 0] = -86;
            e = c[g >> 2] | 0;
            if ((e | 0) != 6104 ? (a[e + -1 >> 0] | 0) == -86 : 0) {
                g = c[b + -4 >> 2] | 0;
                c[e + 4 >> 2] = g;
                c[g >> 2] = e;
                b = c[b >> 2] | 0;
                g = c[f >> 2] | 0;
                c[b + 4 >> 2] = g;
                c[g >> 2] = b
            } else e = g;
            b = c[e + 4 >> 2] | 0;
            if ((b | 0) == 6104) {
                i = d;
                return
            }
            if ((a[b + -1 >> 0] | 0) != -86) {
                i = d;
                return
            }
            g = c[b >> 2] | 0;
            h = c[b + 4 >> 2] | 0;
            c[g + 4 >> 2] = h;
            c[h >> 2] = g;
            h = e + 8 | 0;
            g = c[h >> 2] | 0;
            j = e + 12 | 0;
            f = c[j >> 2] | 0;
            c[g + 4 >> 2] = f;
            c[f >> 2] = g;
            f = b + 8 | 0;
            g = b + 12 | 0;
            e = c[g >> 2] | 0;
            c[g >> 2] = h;
            c[h >> 2] = f;
            c[j >> 2] = e;
            c[e >> 2] = h;
            f = c[f >> 2] | 0;
            g = c[g >> 2] | 0;
            c[f + 4 >> 2] = g;
            c[g >> 2] = f;
            i = d;
            return
        }

        function Xd(a, b) {
            a = a | 0;
            b = b | 0;
            var d = 0,
                e = 0,
                f = 0;
            d = i;
            do
                if (a) {
                    if (!b) {
                        Wd(a);
                        e = 0;
                        break
                    }
                    e = Vd(b) | 0;
                    if (!e) e = 0;
                    else {
                        f = (c[a + -4 >> 2] | 0) - a + -1 | 0;
                        fe(e | 0, a | 0, (f >>> 0 > b >>> 0 ? b : f) | 0) | 0;
                        Wd(a)
                    }
                } else e = Vd(b) | 0;
            while (0);
            i = d;
            return e | 0
        }

        function Yd(b, c, d) {
            b = b | 0;
            c = c | 0;
            d = d | 0;
            var e = 0,
                f = 0,
                g = 0,
                h = 0;
            f = i;
            if (!d) {
                h = 0;
                i = f;
                return h | 0
            }
            while (1) {
                g = a[b >> 0] | 0;
                h = a[c >> 0] | 0;
                if (g << 24 >> 24 != h << 24 >> 24) break;
                d = d + -1 | 0;
                if (!d) {
                    b = 0;
                    e = 5;
                    break
                } else {
                    b = b + 1 | 0;
                    c = c + 1 | 0
                }
            }
            if ((e | 0) == 5) {
                i = f;
                return b | 0
            }
            h = (g & 255) - (h & 255) | 0;
            i = f;
            return h | 0
        }

        function Zd() {}

        function _d(a, b, c) {
            a = a | 0;
            b = b | 0;
            c = c | 0;
            if ((c | 0) < 32) {
                D = b >> c;
                return a >>> c | (b & (1 << c) - 1) << 32 - c
            }
            D = (b | 0) < 0 ? -1 : 0;
            return b >> c - 32 | 0
        }

        function $d(a, b, c, d) {
            a = a | 0;
            b = b | 0;
            c = c | 0;
            d = d | 0;
            b = b - d - (c >>> 0 > a >>> 0 | 0) >>> 0;
            return (D = b, a - c >>> 0 | 0) | 0
        }

        function ae(a, b, c, d) {
            a = a | 0;
            b = b | 0;
            c = c | 0;
            d = d | 0;
            c = a + c >>> 0;
            return (D = b + d + (c >>> 0 < a >>> 0 | 0) >>> 0, c | 0) | 0
        }

        function be(b) {
            b = b | 0;
            var c = 0;
            c = b;
            while (a[c >> 0] | 0) c = c + 1 | 0;
            return c - b | 0
        }

        function ce(b, d, e) {
            b = b | 0;
            d = d | 0;
            e = e | 0;
            var f = 0,
                g = 0,
                h = 0,
                i = 0;
            f = b + e | 0;
            if ((e | 0) >= 20) {
                d = d & 255;
                i = b & 3;
                h = d | d << 8 | d << 16 | d << 24;
                g = f & ~3;
                if (i) {
                    i = b + 4 - i | 0;
                    while ((b | 0) < (i | 0)) {
                        a[b >> 0] = d;
                        b = b + 1 | 0
                    }
                }
                while ((b | 0) < (g | 0)) {
                    c[b >> 2] = h;
                    b = b + 4 | 0
                }
            }
            while ((b | 0) < (f | 0)) {
                a[b >> 0] = d;
                b = b + 1 | 0
            }
            return b - e | 0
        }

        function de(a, b, c) {
            a = a | 0;
            b = b | 0;
            c = c | 0;
            if ((c | 0) < 32) {
                D = b << c | (a & (1 << c) - 1 << 32 - c) >>> 32 - c;
                return a << c
            }
            D = a << c - 32;
            return 0
        }

        function ee(a) {
            a = a | 0;
            return (a & 255) << 24 | (a >> 8 & 255) << 16 | (a >> 16 & 255) << 8 | a >>> 24 | 0
        }

        function fe(b, d, e) {
            b = b | 0;
            d = d | 0;
            e = e | 0;
            var f = 0;
            if ((e | 0) >= 4096) return ua(b | 0, d | 0, e | 0) | 0;
            f = b | 0;
            if ((b & 3) == (d & 3)) {
                while (b & 3) {
                    if (!e) return f | 0;
                    a[b >> 0] = a[d >> 0] | 0;
                    b = b + 1 | 0;
                    d = d + 1 | 0;
                    e = e - 1 | 0
                }
                while ((e | 0) >= 4) {
                    c[b >> 2] = c[d >> 2];
                    b = b + 4 | 0;
                    d = d + 4 | 0;
                    e = e - 4 | 0
                }
            }
            while ((e | 0) > 0) {
                a[b >> 0] = a[d >> 0] | 0;
                b = b + 1 | 0;
                d = d + 1 | 0;
                e = e - 1 | 0
            }
            return f | 0
        }

        function ge(a, b, c) {
            a = a | 0;
            b = b | 0;
            c = c | 0;
            if ((c | 0) < 32) {
                D = b >>> c;
                return a >>> c | (b & (1 << c) - 1) << 32 - c
            }
            D = 0;
            return b >>> c - 32 | 0
        }

        function he(b) {
            b = b | 0;
            var c = 0;
            c = a[n + (b >>> 24) >> 0] | 0;
            if ((c | 0) < 8) return c | 0;
            c = a[n + (b >> 16 & 255) >> 0] | 0;
            if ((c | 0) < 8) return c + 8 | 0;
            c = a[n + (b >> 8 & 255) >> 0] | 0;
            if ((c | 0) < 8) return c + 16 | 0;
            return (a[n + (b & 255) >> 0] | 0) + 24 | 0
        }

        function ie(b) {
            b = b | 0;
            var c = 0;
            c = a[m + (b & 255) >> 0] | 0;
            if ((c | 0) < 8) return c | 0;
            c = a[m + (b >> 8 & 255) >> 0] | 0;
            if ((c | 0) < 8) return c + 8 | 0;
            c = a[m + (b >> 16 & 255) >> 0] | 0;
            if ((c | 0) < 8) return c + 16 | 0;
            return (a[m + (b >>> 24) >> 0] | 0) + 24 | 0
        }

        function je(a, b) {
            a = a | 0;
            b = b | 0;
            var c = 0,
                d = 0,
                e = 0,
                f = 0;
            f = a & 65535;
            d = b & 65535;
            c = $(d, f) | 0;
            e = a >>> 16;
            d = (c >>> 16) + ($(d, e) | 0) | 0;
            b = b >>> 16;
            a = $(b, f) | 0;
            return (D = (d >>> 16) + ($(b, e) | 0) + (((d & 65535) + a | 0) >>> 16) | 0, d + a << 16 | c & 65535 | 0) | 0
        }

        function ke(a, b, c, d) {
            a = a | 0;
            b = b | 0;
            c = c | 0;
            d = d | 0;
            var e = 0,
                f = 0;
            e = a;
            f = c;
            a = je(e, f) | 0;
            c = D;
            return (D = ($(b, f) | 0) + ($(d, e) | 0) + c | c & 0, a | 0 | 0) | 0
        }

        function le(a, b, c, d) {
            a = a | 0;
            b = b | 0;
            c = c | 0;
            d = d | 0;
            return xa[a & 1](b | 0, c | 0, d | 0) | 0
        }

        function me(a, b, c, d, e, f, g, h, i, j, k) {
            a = a | 0;
            b = b | 0;
            c = c | 0;
            d = d | 0;
            e = e | 0;
            f = f | 0;
            g = g | 0;
            h = h | 0;
            i = i | 0;
            j = j | 0;
            k = k | 0;
            ya[a & 1](b | 0, c | 0, d | 0, e | 0, f | 0, g | 0, h | 0, i | 0, j | 0, k | 0)
        }

        function ne(a, b, c, d, e, f, g, h) {
            a = a | 0;
            b = b | 0;
            c = c | 0;
            d = d | 0;
            e = e | 0;
            f = f | 0;
            g = g | 0;
            h = h | 0;
            za[a & 7](b | 0, c | 0, d | 0, e | 0, f | 0, g | 0, h | 0)
        }

        function oe(a, b, c, d, e, f, g, h, i, j, k, l, m, n) {
            a = a | 0;
            b = b | 0;
            c = c | 0;
            d = d | 0;
            e = e | 0;
            f = f | 0;
            g = g | 0;
            h = h | 0;
            i = i | 0;
            j = j | 0;
            k = k | 0;
            l = l | 0;
            m = m | 0;
            n = n | 0;
            Aa[a & 3](b | 0, c | 0, d | 0, e | 0, f | 0, g | 0, h | 0, i | 0, j | 0, k | 0, l | 0, m | 0, n | 0)
        }

        function pe(a, b) {
            a = a | 0;
            b = b | 0;
            Ba[a & 1](b | 0)
        }

        function qe(a, b, c) {
            a = a | 0;
            b = b | 0;
            c = c | 0;
            Ca[a & 7](b | 0, c | 0)
        }

        function re(a, b, c, d, e, f, g) {
            a = a | 0;
            b = b | 0;
            c = c | 0;
            d = d | 0;
            e = e | 0;
            f = f | 0;
            g = g | 0;
            return Da[a & 1](b | 0, c | 0, d | 0, e | 0, f | 0, g | 0) | 0
        }

        function se(a, b) {
            a = a | 0;
            b = b | 0;
            return Ea[a & 3](b | 0) | 0
        }

        function te(a, b, c, d) {
            a = a | 0;
            b = b | 0;
            c = c | 0;
            d = d | 0;
            Fa[a & 7](b | 0, c | 0, d | 0)
        }

        function ue(a, b, c, d, e) {
            a = a | 0;
            b = b | 0;
            c = c | 0;
            d = d | 0;
            e = e | 0;
            return Ga[a & 1](b | 0, c | 0, d | 0, e | 0) | 0
        }

        function ve(a, b, c, d, e, f, g) {
            a = a | 0;
            b = b | 0;
            c = c | 0;
            d = d | 0;
            e = e | 0;
            f = f | 0;
            g = g | 0;
            Ha[a & 3](b | 0, c | 0, d | 0, e | 0, f | 0, g | 0)
        }

        function we(a, b, c) {
            a = a | 0;
            b = b | 0;
            c = c | 0;
            return Ia[a & 1](b | 0, c | 0) | 0
        }

        function xe(a, b, c, d, e, f) {
            a = a | 0;
            b = b | 0;
            c = c | 0;
            d = d | 0;
            e = e | 0;
            f = f | 0;
            return Ja[a & 1](b | 0, c | 0, d | 0, e | 0, f | 0) | 0
        }

        function ye(a, b, c, d, e) {
            a = a | 0;
            b = b | 0;
            c = c | 0;
            d = d | 0;
            e = e | 0;
            Ka[a & 7](b | 0, c | 0, d | 0, e | 0)
        }

        function ze(a, b, c) {
            a = a | 0;
            b = b | 0;
            c = c | 0;
            aa(0);
            return 0
        }

        function Ae(a, b, c, d, e, f, g, h, i, j) {
            a = a | 0;
            b = b | 0;
            c = c | 0;
            d = d | 0;
            e = e | 0;
            f = f | 0;
            g = g | 0;
            h = h | 0;
            i = i | 0;
            j = j | 0;
            aa(1)
        }

        function Be(a, b, c, d, e, f, g) {
            a = a | 0;
            b = b | 0;
            c = c | 0;
            d = d | 0;
            e = e | 0;
            f = f | 0;
            g = g | 0;
            aa(2)
        }

        function Ce(a, b, c, d, e, f, g, h, i, j, k, l, m) {
            a = a | 0;
            b = b | 0;
            c = c | 0;
            d = d | 0;
            e = e | 0;
            f = f | 0;
            g = g | 0;
            h = h | 0;
            i = i | 0;
            j = j | 0;
            k = k | 0;
            l = l | 0;
            m = m | 0;
            aa(3)
        }

        function De(a) {
            a = a | 0;
            aa(4)
        }

        function Ee(a, b) {
            a = a | 0;
            b = b | 0;
            aa(5)
        }

        function Fe(a, b, c, d, e, f) {
            a = a | 0;
            b = b | 0;
            c = c | 0;
            d = d | 0;
            e = e | 0;
            f = f | 0;
            aa(6);
            return 0
        }

        function Ge(a) {
            a = a | 0;
            aa(7);
            return 0
        }

        function He(a, b, c) {
            a = a | 0;
            b = b | 0;
            c = c | 0;
            aa(8)
        }

        function Ie(a, b, c, d) {
            a = a | 0;
            b = b | 0;
            c = c | 0;
            d = d | 0;
            aa(9);
            return 0
        }

        function Je(a, b, c, d, e, f) {
            a = a | 0;
            b = b | 0;
            c = c | 0;
            d = d | 0;
            e = e | 0;
            f = f | 0;
            aa(10)
        }

        function Ke(a, b) {
            a = a | 0;
            b = b | 0;
            aa(11);
            return 0
        }

        function Le(a, b, c, d, e) {
            a = a | 0;
            b = b | 0;
            c = c | 0;
            d = d | 0;
            e = e | 0;
            aa(12);
            return 0
        }

        function Me(a, b, c, d) {
            a = a | 0;
            b = b | 0;
            c = c | 0;
            d = d | 0;
            aa(13)
        }

        // EMSCRIPTEN_END_FUNCS
        var xa = [ze, Mc];
        var ya = [Ae, sc];
        var za = [Be, Sd, Td, Ud, cc, vc, wc, Rd];
        var Aa = [Ce, tc, uc, Ce];
        var Ba = [De, Mb];
        var Ca = [Ee, jc, oc, pc, qc, rc, Fc, rd];
        var Da = [Fe, Kc];
        var Ea = [Ge, Jb, Lb, Ge];
        var Fa = [He, hc, ic, kc, lc, mc, nc, He];
        var Ga = [Ie, Kb];
        var Ha = [Je, xc, yc, Je];
        var Ia = [Ke, Pb];
        var Ja = [Le, Lc];
        var Ka = [Me, dc, ec, fc, gc, Me, Me, Me];
        return {
            _i64Subtract: $d,
            _free: Wd,
            _bpg_decoder_decode: Kd,
            _bpg_decoder_start: Ed,
            _realloc: Xd,
            _i64Add: ae,
            _bpg_decoder_open: Jd,
            _bitshift64Ashr: _d,
            _strlen: be,
            _bpg_decoder_get_info: Dd,
            _memset: ce,
            _malloc: Vd,
            _memcpy: fe,
            _bpg_decoder_get_line: Gd,
            _bpg_decoder_close: Md,
            _bpg_decoder_get_frame_duration: Fd,
            _llvm_bswap_i32: ee,
            _bitshift64Shl: de,
            runPostSets: Zd,
            stackAlloc: La,
            stackSave: Ma,
            stackRestore: Na,
            setThrew: Oa,
            setTempRet0: Ra,
            getTempRet0: Sa,
            dynCall_iiii: le,
            dynCall_viiiiiiiiii: me,
            dynCall_viiiiiii: ne,
            dynCall_viiiiiiiiiiiii: oe,
            dynCall_vi: pe,
            dynCall_vii: qe,
            dynCall_iiiiiii: re,
            dynCall_ii: se,
            dynCall_viii: te,
            dynCall_iiiii: ue,
            dynCall_viiiiii: ve,
            dynCall_iii: we,
            dynCall_iiiiii: xe,
            dynCall_viiii: ye
        }
    })

    // EMSCRIPTEN_END_ASM
    (Module.asmGlobalArg, Module.asmLibraryArg, buffer);
    var _i64Subtract = Module["_i64Subtract"] = asm["_i64Subtract"];
    var _free = Module["_free"] = asm["_free"];
    var _bpg_decoder_decode = Module["_bpg_decoder_decode"] = asm["_bpg_decoder_decode"];
    var _bpg_decoder_start = Module["_bpg_decoder_start"] = asm["_bpg_decoder_start"];
    var _realloc = Module["_realloc"] = asm["_realloc"];
    var _i64Add = Module["_i64Add"] = asm["_i64Add"];
    var _bpg_decoder_open = Module["_bpg_decoder_open"] = asm["_bpg_decoder_open"];
    var _bitshift64Ashr = Module["_bitshift64Ashr"] = asm["_bitshift64Ashr"];
    var _strlen = Module["_strlen"] = asm["_strlen"];
    var _bpg_decoder_get_info = Module["_bpg_decoder_get_info"] = asm["_bpg_decoder_get_info"];
    var _memset = Module["_memset"] = asm["_memset"];
    var _malloc = Module["_malloc"] = asm["_malloc"];
    var _memcpy = Module["_memcpy"] = asm["_memcpy"];
    var _bpg_decoder_get_line = Module["_bpg_decoder_get_line"] = asm["_bpg_decoder_get_line"];
    var _bpg_decoder_close = Module["_bpg_decoder_close"] = asm["_bpg_decoder_close"];
    var _bpg_decoder_get_frame_duration = Module["_bpg_decoder_get_frame_duration"] = asm["_bpg_decoder_get_frame_duration"];
    var _llvm_bswap_i32 = Module["_llvm_bswap_i32"] = asm["_llvm_bswap_i32"];
    var _bitshift64Shl = Module["_bitshift64Shl"] = asm["_bitshift64Shl"];
    var runPostSets = Module["runPostSets"] = asm["runPostSets"];
    var dynCall_iiii = Module["dynCall_iiii"] = asm["dynCall_iiii"];
    var dynCall_viiiiiiiiii = Module["dynCall_viiiiiiiiii"] = asm["dynCall_viiiiiiiiii"];
    var dynCall_viiiiiii = Module["dynCall_viiiiiii"] = asm["dynCall_viiiiiii"];
    var dynCall_viiiiiiiiiiiii = Module["dynCall_viiiiiiiiiiiii"] = asm["dynCall_viiiiiiiiiiiii"];
    var dynCall_vi = Module["dynCall_vi"] = asm["dynCall_vi"];
    var dynCall_vii = Module["dynCall_vii"] = asm["dynCall_vii"];
    var dynCall_iiiiiii = Module["dynCall_iiiiiii"] = asm["dynCall_iiiiiii"];
    var dynCall_ii = Module["dynCall_ii"] = asm["dynCall_ii"];
    var dynCall_viii = Module["dynCall_viii"] = asm["dynCall_viii"];
    var dynCall_iiiii = Module["dynCall_iiiii"] = asm["dynCall_iiiii"];
    var dynCall_viiiiii = Module["dynCall_viiiiii"] = asm["dynCall_viiiiii"];
    var dynCall_iii = Module["dynCall_iii"] = asm["dynCall_iii"];
    var dynCall_iiiiii = Module["dynCall_iiiiii"] = asm["dynCall_iiiiii"];
    var dynCall_viiii = Module["dynCall_viiii"] = asm["dynCall_viiii"];
    Runtime.stackAlloc = asm["stackAlloc"];
    Runtime.stackSave = asm["stackSave"];
    Runtime.stackRestore = asm["stackRestore"];
    Runtime.setTempRet0 = asm["setTempRet0"];
    Runtime.getTempRet0 = asm["getTempRet0"];
    var i64Math = null;
    if (memoryInitializer) {
        if (typeof Module["locateFile"] === "function") {
            memoryInitializer = Module["locateFile"](memoryInitializer)
        } else if (Module["memoryInitializerPrefixURL"]) {
            memoryInitializer = Module["memoryInitializerPrefixURL"] + memoryInitializer
        }

        addRunDependency("memory initializer");
        Browser.asyncLoad(memoryInitializer, (function(data) {
            HEAPU8.set(data, STATIC_BASE);
            removeRunDependency("memory initializer")
        }), (function(data) {
            throw "could not load memory initializer " + memoryInitializer
        }))

    }

    function ExitStatus(status) {
        this.name = "ExitStatus";
        this.message = "Program terminated with exit(" + status + ")";
        this.status = status
    }
    ExitStatus.prototype = new Error;
    ExitStatus.prototype.constructor = ExitStatus;
    var initialStackTop;
    var preloadStartTime = null;
    var calledMain = false;
    dependenciesFulfilled = function runCaller() {
        if (!Module["calledRun"] && shouldRunNow) run();
        if (!Module["calledRun"]) dependenciesFulfilled = runCaller
    };

    function run(args) {
        args = args || Module["arguments"];
        if (preloadStartTime === null) preloadStartTime = Date.now();
        if (runDependencies > 0) {
            return
        }
        preRun();
        if (runDependencies > 0) return;
        if (Module["calledRun"]) return;

        function doRun() {
            if (Module["calledRun"]) return;
            Module["calledRun"] = true;
            if (ABORT) return;
            ensureInitRuntime();
            preMain();
            postRun()
        }
        if (Module["setStatus"]) {
            Module["setStatus"]("Running...");
            setTimeout((function() {
                setTimeout((function() {
                    Module["setStatus"]("")
                }), 1);
                doRun()
            }), 1)
        } else {
            doRun()
        }
    }
    Module["run"] = Module.run = run;

    function exit(status) {
        if (Module["noExitRuntime"]) {
            return
        }
        ABORT = true;
        EXITSTATUS = status;
        STACKTOP = initialStackTop;
        exitRuntime();
        throw new ExitStatus(status)
    }
    Module["exit"] = Module.exit = exit;

    function abort(text) {
        if (text) {
            Module.print(text);
            Module.printErr(text)
        }
        ABORT = true;
        EXITSTATUS = 1;
        var extra = "\nIf this abort() is unexpected, build with -s ASSERTIONS=1 which can give more information.";
        throw "abort() at " + stackTrace() + extra
    }
    Module["abort"] = Module.abort = abort;
    if (Module["preInit"]) {
        if (typeof Module["preInit"] == "function") Module["preInit"] = [Module["preInit"]];
        while (Module["preInit"].length > 0) {
            Module["preInit"].pop()()
        }
    }
    var shouldRunNow = true;
    if (Module["noInitialRun"]) {
        shouldRunNow = false
    }
    run();
    var BPGDecoder = (function(ctx) {
        this.ctx = ctx;
        this["imageData"] = null;
        this["onload"] = null;
        this["frames"] = null;
        this["loop_count"] = 0
    });
    BPGDecoder.prototype = {
        malloc: Module["cwrap"]("malloc", "number", ["number"]),
        free: Module["cwrap"]("free", "void", ["number"]),
        bpg_decoder_open: Module["cwrap"]("bpg_decoder_open", "number", []),
        bpg_decoder_decode: Module["cwrap"]("bpg_decoder_decode", "number", ["number", "array", "number"]),
        bpg_decoder_get_info: Module["cwrap"]("bpg_decoder_get_info", "number", ["number", "number"]),
        bpg_decoder_start: Module["cwrap"]("bpg_decoder_start", "number", ["number", "number"]),
        bpg_decoder_get_frame_duration: Module["cwrap"]("bpg_decoder_get_frame_duration", "void", ["number", "number", "number"]),
        bpg_decoder_get_line: Module["cwrap"]("bpg_decoder_get_line", "number", ["number", "number"]),
        bpg_decoder_close: Module["cwrap"]("bpg_decoder_close", "void", ["number"]),
        load: (function(url) {
            var request = new XMLHttpRequest;
            var this1 = this;
            request.open("get", url, true);
            request.responseType = "arraybuffer";
            request.onload = (function(event) {
                this1._onload(request, event)
            });
            request.send()
        }),
        _onload: (function(request, event) {
            var data = request.response;
            var array = new Uint8Array(data);
            var img, w, h, img_info_buf, cimg, p0, rgba_line, w4, frame_count;
            var heap8, heap16, heap32, dst, v, i, y, func, duration, frames, loop_count;
            img = this.bpg_decoder_open();
            if (this.bpg_decoder_decode(img, array, array.length) < 0) {
                console.log("could not decode image");
                throw new Error("could not decode image");
            }
            img_info_buf = this.malloc(5 * 4);
            this.bpg_decoder_get_info(img, img_info_buf);
            heap8 = Module["HEAPU8"];
            heap16 = Module["HEAPU16"];
            heap32 = Module["HEAPU32"];
            w = heap32[img_info_buf >> 2];
            h = heap32[img_info_buf + 4 >> 2];
            loop_count = heap16[img_info_buf + 16 >> 1];
            w4 = w * 4;
            rgba_line = this.malloc(w4);
            frame_count = 0;
            frames = [];
            for (;;) {
                if (this.bpg_decoder_start(img, 1) < 0) break;
                this.bpg_decoder_get_frame_duration(img, img_info_buf, img_info_buf + 4);
                duration = heap32[img_info_buf >> 2] * 1e3 / heap32[img_info_buf + 4 >> 2];
                cimg = this.ctx.createImageData(w, h);
                dst = cimg.data;
                p0 = 0;
                for (y = 0; y < h; y++) {
                    this.bpg_decoder_get_line(img, rgba_line);
                    for (i = 0; i < w4; i = i + 1 | 0) {
                        dst[p0] = heap8[rgba_line + i | 0] | 0;
                        p0 = p0 + 1 | 0
                    }
                }
                frames[frame_count++] = {
                    "img": cimg,
                    "duration": duration
                }
            }
            this.free(rgba_line);
            this.free(img_info_buf);
            this.bpg_decoder_close(img);
            this["loop_count"] = loop_count;
            this["frames"] = frames;
            this["imageData"] = frames[0]["img"];
            if (this["onload"]) this["onload"]()
        })
    };

    return BPGDecoder;
})()
