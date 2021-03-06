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
    allocate([0, 0, 1, 0, 1, 2, 0, 1, 2, 3, 1, 2, 3, 2, 3, 3, 0, 1, 0, 2, 1, 0, 3, 2, 1, 0, 3, 2, 1, 3, 2, 3, 0, 0, 1, 0, 1, 2, 0, 1, 2, 3, 0, 1, 2, 3, 4, 0, 1, 2, 3, 4, 5, 0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4, 5, 6, 7, 1, 2, 3, 4, 5, 6, 7, 2, 3, 4, 5, 6, 7, 3, 4, 5, 6, 7, 4, 5, 6, 7, 5, 6, 7, 6, 7, 7, 0, 1, 0, 2, 1, 0, 3, 2, 1, 0, 4, 3, 2, 1, 0, 5, 4, 3, 2, 1, 0, 6, 5, 4, 3, 2, 1, 0, 7, 6, 5, 4, 3, 2, 1, 0, 7, 6, 5, 4, 3, 2, 1, 7, 6, 5, 4, 3, 2, 7, 6, 5, 4, 3, 7, 6, 5, 4, 7, 6, 5, 7, 6, 7, 40, 45, 51, 57, 64, 72, 0, 0, 29, 0, 0, 0, 30, 0, 0, 0, 31, 0, 0, 0, 32, 0, 0, 0, 33, 0, 0, 0, 33, 0, 0, 0, 34, 0, 0, 0, 34, 0, 0, 0, 35, 0, 0, 0, 35, 0, 0, 0, 36, 0, 0, 0, 36, 0, 0, 0, 37, 0, 0, 0, 37, 0, 0, 0, 0, 1, 2, 3, 4, 5, 0, 1, 2, 3, 4, 5, 0, 1, 2, 3, 4, 5, 0, 1, 2, 3, 4, 5, 0, 1, 2, 3, 4, 5, 0, 1, 2, 3, 4, 5, 0, 1, 2, 3, 4, 5, 0, 1, 2, 3, 4, 5, 0, 1, 2, 3, 4, 5, 0, 1, 2, 3, 4, 5, 0, 1, 2, 3, 4, 5, 0, 1, 2, 3, 4, 5, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 6, 7, 7, 7, 7, 7, 7, 8, 8, 8, 8, 8, 8, 9, 9, 9, 9, 9, 9, 10, 10, 10, 10, 10, 10, 11, 11, 11, 11, 11, 11, 12, 12, 0, 0, 0, 0, 0, 0, 0, 2, 5, 9, 1, 4, 8, 12, 3, 7, 11, 14, 6, 10, 13, 15, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 1, 3, 0, 0, 0, 0, 0, 2, 5, 9, 14, 20, 27, 35, 1, 4, 8, 13, 19, 26, 34, 42, 3, 7, 12, 18, 25, 33, 41, 48, 6, 11, 17, 24, 32, 40, 47, 53, 10, 16, 23, 31, 39, 46, 52, 57, 15, 22, 30, 38, 45, 51, 56, 60, 21, 29, 37, 44, 50, 55, 59, 62, 28, 36, 43, 49, 54, 58, 61, 63, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 0, 1, 2, 3, 16, 17, 18, 19, 4, 5, 6, 7, 20, 21, 22, 23, 8, 9, 10, 11, 24, 25, 26, 27, 12, 13, 14, 15, 28, 29, 30, 31, 32, 33, 34, 35, 48, 49, 50, 51, 36, 37, 38, 39, 52, 53, 54, 55, 40, 41, 42, 43, 56, 57, 58, 59, 44, 45, 46, 47, 60, 61, 62, 63, 0, 1, 4, 5, 2, 3, 4, 5, 6, 6, 8, 8, 7, 7, 8, 8, 1, 1, 1, 0, 1, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 2, 2, 2, 2, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 2, 1, 0, 0, 2, 1, 0, 0, 2, 1, 0, 0, 2, 1, 0, 0, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 153, 200, 139, 141, 157, 154, 154, 154, 154, 154, 154, 154, 154, 184, 154, 154, 154, 184, 63, 139, 154, 154, 154, 154, 154, 154, 154, 154, 154, 154, 154, 154, 154, 154, 154, 154, 154, 153, 138, 138, 111, 141, 94, 138, 182, 154, 139, 139, 139, 139, 139, 139, 110, 110, 124, 125, 140, 153, 125, 127, 140, 109, 111, 143, 127, 111, 79, 108, 123, 63, 110, 110, 124, 125, 140, 153, 125, 127, 140, 109, 111, 143, 127, 111, 79, 108, 123, 63, 91, 171, 134, 141, 111, 111, 125, 110, 110, 94, 124, 108, 124, 107, 125, 141, 179, 153, 125, 107, 125, 141, 179, 153, 125, 107, 125, 141, 179, 153, 125, 140, 139, 182, 182, 152, 136, 152, 136, 153, 136, 139, 111, 136, 139, 111, 141, 111, 140, 92, 137, 138, 140, 152, 138, 139, 153, 74, 149, 92, 139, 107, 122, 152, 140, 179, 166, 182, 140, 227, 122, 197, 138, 153, 136, 167, 152, 152, 154, 154, 154, 154, 154, 154, 154, 154, 154, 154, 154, 154, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 153, 185, 107, 139, 126, 154, 197, 185, 201, 154, 154, 154, 149, 154, 139, 154, 154, 154, 152, 139, 110, 122, 95, 79, 63, 31, 31, 153, 153, 153, 153, 140, 198, 140, 198, 168, 79, 124, 138, 94, 153, 111, 149, 107, 167, 154, 139, 139, 139, 139, 139, 139, 125, 110, 94, 110, 95, 79, 125, 111, 110, 78, 110, 111, 111, 95, 94, 108, 123, 108, 125, 110, 94, 110, 95, 79, 125, 111, 110, 78, 110, 111, 111, 95, 94, 108, 123, 108, 121, 140, 61, 154, 155, 154, 139, 153, 139, 123, 123, 63, 153, 166, 183, 140, 136, 153, 154, 166, 183, 140, 136, 153, 154, 166, 183, 140, 136, 153, 154, 170, 153, 123, 123, 107, 121, 107, 121, 167, 151, 183, 140, 151, 183, 140, 140, 140, 154, 196, 196, 167, 154, 152, 167, 182, 182, 134, 149, 136, 153, 121, 136, 137, 169, 194, 166, 167, 154, 167, 137, 182, 107, 167, 91, 122, 107, 167, 154, 154, 154, 154, 154, 154, 154, 154, 154, 154, 154, 154, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 153, 160, 107, 139, 126, 154, 197, 185, 201, 154, 154, 154, 134, 154, 139, 154, 154, 183, 152, 139, 154, 137, 95, 79, 63, 31, 31, 153, 153, 153, 153, 169, 198, 169, 198, 168, 79, 224, 167, 122, 153, 111, 149, 92, 167, 154, 139, 139, 139, 139, 139, 139, 125, 110, 124, 110, 95, 94, 125, 111, 111, 79, 125, 126, 111, 111, 79, 108, 123, 93, 125, 110, 124, 110, 95, 94, 125, 111, 111, 79, 125, 126, 111, 111, 79, 108, 123, 93, 121, 140, 61, 154, 170, 154, 139, 153, 139, 123, 123, 63, 124, 166, 183, 140, 136, 153, 154, 166, 183, 140, 136, 153, 154, 166, 183, 140, 136, 153, 154, 170, 153, 138, 138, 122, 121, 122, 121, 167, 151, 183, 140, 151, 183, 140, 140, 140, 154, 196, 167, 167, 154, 152, 167, 182, 182, 134, 149, 136, 153, 121, 136, 122, 169, 208, 166, 167, 154, 152, 167, 182, 107, 167, 91, 107, 107, 167, 154, 154, 154, 154, 154, 154, 154, 154, 154, 154, 154, 154, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 46, 48, 50, 52, 54, 56, 58, 60, 62, 64, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 5, 5, 6, 6, 7, 8, 9, 10, 11, 13, 14, 16, 18, 20, 22, 24, 0, 0, 29, 30, 31, 32, 33, 33, 34, 34, 35, 35, 36, 36, 37, 37, 0, 0, 104, 101, 118, 99, 0, 0, 0, 0, 128, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 53, 54, 50, 72, 34, 48, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 176, 17, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 26, 10, 1, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 3, 5, 7, 8, 10, 12, 13, 15, 17, 18, 19, 20, 21, 22, 23, 23, 24, 24, 25, 25, 26, 27, 27, 28, 28, 29, 29, 30, 31, 0, 0, 0, 0, 0, 7, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 32, 26, 21, 17, 13, 9, 5, 2, 0, 254, 251, 247, 243, 239, 235, 230, 224, 230, 235, 239, 243, 247, 251, 254, 0, 2, 5, 9, 13, 17, 21, 26, 32, 0, 0, 0, 0, 0, 0, 0, 0, 240, 154, 249, 114, 252, 138, 253, 30, 254, 122, 254, 197, 254, 0, 255, 197, 254, 122, 254, 30, 254, 138, 253, 114, 252, 154, 249, 0, 240, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 64, 90, 90, 90, 89, 88, 87, 85, 83, 82, 80, 78, 75, 73, 70, 67, 64, 61, 57, 54, 50, 46, 43, 38, 36, 31, 25, 22, 18, 13, 9, 4, 1, 2, 0, 3, 4, 0, 0, 0, 255, 0, 1, 0, 0, 255, 0, 1, 255, 255, 1, 1, 1, 255, 255, 1, 16, 16, 16, 16, 17, 18, 21, 24, 16, 16, 16, 16, 17, 19, 22, 25, 16, 16, 17, 18, 20, 22, 25, 29, 16, 16, 18, 21, 24, 27, 31, 36, 17, 17, 20, 24, 30, 35, 41, 47, 18, 19, 22, 27, 35, 44, 54, 65, 21, 22, 25, 31, 41, 54, 70, 88, 24, 25, 29, 36, 47, 65, 88, 115, 16, 16, 16, 16, 17, 18, 20, 24, 16, 16, 16, 17, 18, 20, 24, 25, 16, 16, 17, 18, 20, 24, 25, 28, 16, 17, 18, 20, 24, 25, 28, 33, 17, 18, 20, 24, 25, 28, 33, 41, 18, 20, 24, 25, 28, 33, 41, 54, 20, 24, 25, 28, 33, 41, 54, 71, 24, 25, 28, 33, 41, 54, 71, 91, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 128, 176, 208, 240, 128, 167, 197, 227, 128, 158, 187, 216, 123, 150, 178, 205, 116, 142, 169, 195, 111, 135, 160, 185, 105, 128, 152, 175, 100, 122, 144, 166, 95, 116, 137, 158, 90, 110, 130, 150, 85, 104, 123, 142, 81, 99, 117, 135, 77, 94, 111, 128, 73, 89, 105, 122, 69, 85, 100, 116, 66, 80, 95, 110, 62, 76, 90, 104, 59, 72, 86, 99, 56, 69, 81, 94, 53, 65, 77, 89, 51, 62, 73, 85, 48, 59, 69, 80, 46, 56, 66, 76, 43, 53, 63, 72, 41, 50, 59, 69, 39, 48, 56, 65, 37, 45, 54, 62, 35, 43, 51, 59, 33, 41, 48, 56, 32, 39, 46, 53, 30, 37, 43, 50, 29, 35, 41, 48, 27, 33, 39, 45, 26, 31, 37, 43, 24, 30, 35, 41, 23, 28, 33, 39, 22, 27, 32, 37, 21, 26, 30, 35, 20, 24, 29, 33, 19, 23, 27, 31, 18, 22, 26, 30, 17, 21, 25, 28, 16, 20, 23, 27, 15, 19, 22, 25, 14, 18, 21, 24, 14, 17, 20, 23, 13, 16, 19, 22, 12, 15, 18, 21, 12, 14, 17, 20, 11, 14, 16, 19, 11, 13, 15, 18, 10, 12, 15, 17, 10, 12, 14, 16, 9, 11, 13, 15, 9, 11, 12, 14, 8, 10, 12, 14, 8, 9, 11, 13, 7, 9, 11, 12, 7, 9, 10, 12, 7, 8, 10, 11, 6, 8, 9, 11, 6, 7, 9, 10, 6, 7, 8, 9, 2, 2, 2, 2, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 62, 63, 0, 0, 1, 2, 2, 4, 4, 5, 6, 7, 8, 9, 9, 11, 11, 12, 13, 13, 15, 15, 16, 16, 18, 18, 19, 19, 21, 21, 22, 22, 23, 24, 24, 25, 26, 26, 27, 27, 28, 29, 29, 30, 30, 30, 31, 32, 32, 33, 33, 33, 34, 34, 35, 35, 35, 36, 36, 36, 37, 37, 37, 38, 38, 63, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6, 7, 7, 7, 7, 8, 8, 8, 0, 255, 255, 255, 127, 0, 0, 0, 0, 0, 0, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 0, 0, 0, 0, 0, 0, 0, 0, 3, 1, 1, 0, 36, 56, 37, 56, 38, 56, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 3, 1, 0, 16, 36, 56, 37, 56, 38, 56, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 16, 36, 56, 37, 56, 38, 56, 0, 0, 0, 0, 0, 0, 8, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 36, 56, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 3, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], "i8", ALLOC_NONE, Runtime.GLOBAL_BASE);
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

    function invoke_viiiii(index, a1, a2, a3, a4, a5) {
        try {
            Module["dynCall_viiiii"](index, a1, a2, a3, a4, a5)
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

    function invoke_viiiiiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11, a12) {
        try {
            Module["dynCall_viiiiiiiiiiii"](index, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11, a12)
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

    function invoke_viiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9) {
        try {
            Module["dynCall_viiiiiiiii"](index, a1, a2, a3, a4, a5, a6, a7, a8, a9)
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

    function invoke_viiiiiii(index, a1, a2, a3, a4, a5, a6, a7) {
        try {
            Module["dynCall_viiiiiii"](index, a1, a2, a3, a4, a5, a6, a7)
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
        "invoke_viiiii": invoke_viiiii,
        "invoke_vi": invoke_vi,
        "invoke_vii": invoke_vii,
        "invoke_iiiiiii": invoke_iiiiiii,
        "invoke_viiiiiiiiiiii": invoke_viiiiiiiiiiii,
        "invoke_ii": invoke_ii,
        "invoke_viii": invoke_viii,
        "invoke_viiiiiiiii": invoke_viiiiiiiii,
        "invoke_iiiii": invoke_iiiii,
        "invoke_viiiiii": invoke_viiiiii,
        "invoke_iii": invoke_iii,
        "invoke_iiiiii": invoke_iiiiii,
        "invoke_viiiiiii": invoke_viiiiiii,
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
        var ea = env.invoke_viiiii;
        var fa = env.invoke_vi;
        var ga = env.invoke_vii;
        var ha = env.invoke_iiiiiii;
        var ia = env.invoke_viiiiiiiiiiii;
        var ja = env.invoke_ii;
        var ka = env.invoke_viii;
        var la = env.invoke_viiiiiiiii;
        var ma = env.invoke_iiiii;
        var na = env.invoke_viiiiii;
        var oa = env.invoke_iii;
        var pa = env.invoke_iiiiii;
        var qa = env.invoke_viiiiiii;
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
                Ba = 0,
                Ca = 0,
                Da = 0,
                Fa = 0,
                Ga = 0,
                Ha = 0,
                Ia = 0,
                Ja = 0,
                Ka = 0,
                La = 0,
                Ma = 0,
                Na = 0;
            n = i;
            i = i + 96 | 0;
            v = n + 24 | 0;
            s = n + 8 | 0;
            t = n;
            u = f + 136 | 0;
            o = c[u >> 2] | 0;
            p = c[f + 160 >> 2] | 0;
            m = c[p + (l << 2) + 32 >> 2] | 0;
            r = f + 200 | 0;
            T = c[r >> 2] | 0;
            h = $(h >> c[T + (l << 2) + 13180 >> 2], m) | 0;
            h = (c[p + (l << 2) >> 2] | 0) + (h + (g >> c[T + (l << 2) + 13168 >> 2] << c[T + 56 >> 2])) | 0;
            T = (l | 0) != 0;
            g = o + 320 | 0;
            p = T ? o + 11680 | 0 : g;
            x = v + 0 | 0;
            q = x + 64 | 0;
            do {
                a[x >> 0] = 0;
                x = x + 1 | 0
            } while ((x | 0) < (q | 0));
            S = 1 << j;
            y = (l | 0) == 0;
            x = c[(y ? o + 288 | 0 : o + 292 | 0) >> 2] | 0;
            q = S << j;
            ce(p | 0, 0, q << 1 | 0) | 0;
            z = o + 31256 | 0;
            if (!(a[z >> 0] | 0)) {
                A = a[o + 272 >> 0] | 0;
                C = f + 204 | 0;
                Ma = c[C >> 2] | 0;
                if ((a[Ma + 21 >> 0] | 0) != 0 ? (d[Ma + 1629 >> 0] | 0) >= (j | 0) : 0) {
                    F = c[u >> 2] | 0;
                    F = _a(F + 224 | 0, F + (T & 1 | 46) | 0) | 0
                } else F = 0;
                if (y) {
                    B = c[r >> 2] | 0;
                    G = B;
                    B = (c[B + 13192 >> 2] | 0) + A | 0
                } else {
                    B = c[C >> 2] | 0;
                    if ((l | 0) == 1) B = (c[f + 2072 >> 2] | 0) + (c[B + 28 >> 2] | 0) + (a[o + 302 >> 0] | 0) | 0;
                    else B = (c[f + 2076 >> 2] | 0) + (c[B + 32 >> 2] | 0) + (a[o + 303 >> 0] | 0) | 0;
                    B = B + A | 0;
                    G = c[r >> 2] | 0;
                    A = c[G + 13192 >> 2] | 0;
                    E = 0 - A | 0;
                    if ((B | 0) >= (E | 0)) E = (B | 0) > 57 ? 57 : B;
                    do
                        if ((c[G + 4 >> 2] | 0) == 1) {
                            if ((E | 0) >= 30)
                                if ((E | 0) > 43) {
                                    E = E + -6 | 0;
                                    break
                                } else {
                                    E = c[176 + (E + -30 << 2) >> 2] | 0;
                                    break
                                }
                        } else E = (E | 0) > 51 ? 51 : E;
                    while (0);
                    B = A + E | 0
                }
                A = (c[G + 52 >> 2] | 0) + j | 0;
                E = A + -5 | 0;
                A = 1 << A + -6;
                B = d[168 + (d[232 + B >> 0] | 0) >> 0] << d[312 + B >> 0];
                if ((a[G + 634 >> 0] | 0) != 0 ? !((F | 0) != 0 & (j | 0) > 2) : 0) {
                    H = c[C >> 2] | 0;
                    G = (a[H + 68 >> 0] | 0) == 0 ? G + 635 | 0 : H + 69 | 0;
                    H = ((c[o + 31244 >> 2] | 0) != 1 ? 3 : 0) + l | 0;
                    C = G + ((j + -2 | 0) * 384 | 0) + (H << 6) | 0;
                    if ((j | 0) > 3) ia = a[G + ((j + -4 | 0) * 6 | 0) + H + 1536 >> 0] | 0;
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
            I = (j << 1) + -1 | 0;
            if (y) {
                G = (j * 3 | 0) + -6 + (j + -1 >> 2) | 0;
                J = j + 1 >> 2
            } else {
                G = 15;
                J = j + -2 | 0
            }
            if ((I | 0) > 0) {
                L = G + 52 | 0;
                H = 0;
                while (1) {
                    Ma = c[u >> 2] | 0;
                    K = H + 1 | 0;
                    if (!(_a(Ma + 224 | 0, Ma + (L + (H >> J)) | 0) | 0)) break;
                    if ((K | 0) < (I | 0)) H = K;
                    else {
                        H = K;
                        break
                    }
                }
                K = G + 70 | 0;
                G = 0;
                while (1) {
                    Ma = c[u >> 2] | 0;
                    L = G + 1 | 0;
                    if (!(_a(Ma + 224 | 0, Ma + (K + (G >> J)) | 0) | 0)) break;
                    if ((L | 0) < (I | 0)) G = L;
                    else {
                        G = L;
                        break
                    }
                }
                if ((H | 0) > 3) {
                    I = (H >> 1) + -1 | 0;
                    K = ab((c[u >> 2] | 0) + 224 | 0) | 0;
                    if ((I | 0) > 1) {
                        J = 1;
                        do {
                            K = ab((c[u >> 2] | 0) + 224 | 0) | 0 | K << 1;
                            J = J + 1 | 0
                        } while ((J | 0) != (I | 0))
                    }
                    H = K + ((H & 1 | 2) << I) | 0
                }
                if ((G | 0) > 3) {
                    J = (G >> 1) + -1 | 0;
                    K = ab((c[u >> 2] | 0) + 224 | 0) | 0;
                    if ((J | 0) > 1) {
                        I = 1;
                        do {
                            K = ab((c[u >> 2] | 0) + 224 | 0) | 0 | K << 1;
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
                        J = 488;
                        K = 504;
                        L = 496;
                        I = 520;
                        break
                    } else if (k) {
                        J = I;
                        K = L;
                        w = 49;
                        break
                    }
                    P = d[(I & 3) + (392 + ((L & 3) << 2)) >> 0] | 0;
                    if ((S | 0) == 8) {
                        G = I;
                        H = L;
                        P = (d[416 + (N << 1) + M >> 0] << 4) + P | 0;
                        J = 496;
                        K = 8;
                        L = 488;
                        I = 24;
                        break
                    } else if ((S | 0) == 16) {
                        G = I;
                        H = L;
                        P = (d[392 + (N << 2) + M >> 0] << 4) + P | 0;
                        J = 8;
                        K = 8;
                        L = 24;
                        I = 24;
                        break
                    } else if ((S | 0) == 4) {
                        G = I;
                        H = L;
                        J = 408;
                        K = 8;
                        L = 408;
                        I = 24;
                        break
                    } else {
                        G = I;
                        H = L;
                        P = (d[424 + (N << 3) + M >> 0] << 4) + P | 0;
                        J = 40;
                        K = 8;
                        L = 104;
                        I = 24;
                        break
                    }
                } else {
                    J = L;
                    K = I;
                    M = L >> 2;
                    N = I >> 2;
                    w = 49
                }
            while (0);
            if ((w | 0) == 49) {
                G = J;
                H = K;
                P = d[536 + (J << 3) + K >> 0] | 0;
                J = 496;
                K = 520;
                L = 488;
                I = 504
            }
            O = P + 1 | 0;
            P = P >> 4;
            if ((P | 0) > -1) {
                Q = (1 << j + -2) + -1 | 0;
                R = (l | 0) > 0;
                l = R ? 90 : 88;
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
                ea = o + 31244 | 0;
                ca = x & -17;
                ga = f + 204 | 0;
                Y = ((B | 0) < 0) << 31 >> 31;
                X = ((A | 0) < 0) << 31 >> 31;
                ha = (F | 0) != 0 & (j | 0) > 2;
                k = (j | 0) < 4;
                ia = ia & 255;
                ma = (y & 1) << 1;
                ja = ma | 1;
                ra = 1;
                ka = P;
                oa = 0;
                xa = 16;
                while (1) {
                    na = ka << 4;
                    wa = a[J + ka >> 0] | 0;
                    ta = wa & 255;
                    va = a[L + ka >> 0] | 0;
                    ua = va & 255;
                    la = (ka | 0) > 0;
                    if ((ka | 0) < (P | 0) & la) {
                        if ((ta | 0) < (Q | 0)) pa = d[v + (ta + 1 << 3) + ua >> 0] | 0;
                        else pa = 0;
                        if ((ua | 0) < (Q | 0)) pa = (d[ua + 1 + (v + (ta << 3)) >> 0] | 0) + pa | 0;
                        ya = c[u >> 2] | 0;
                        ya = (_a(ya + 224 | 0, ya + (((pa | 0) > 1 ? 1 : pa) + l) | 0) | 0) & 255;
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
                    pa = (ka | 0) == (P | 0);
                    if (pa) {
                        a[s >> 0] = na + 255;
                        sa = na + -2 | 0;
                        na = 1
                    } else {
                        sa = 15;
                        na = 0
                    }
                    if ((ta | 0) < (S | 0)) Ba = (a[v + (ta + 1 << 3) + ua >> 0] | 0) != 0 & 1;
                    else Ba = 0;
                    if ((ua | 0) < (S | 0)) Ba = ((a[ua + 1 + (v + (ta << 3)) >> 0] | 0) != 0 & 1) << 1 | Ba;
                    do
                        if (ya << 24 >> 24 != 0 & (sa | 0) > -1) {
                            if (!(c[(c[r >> 2] | 0) + 13100 >> 2] | 0))
                                if (U) {
                                    wa = 600;
                                    va = W
                                } else w = 73;
                            else if (da) {
                                ya = (a[z >> 0] | 0) != 0;
                                if (ya | U) {
                                    wa = ya ? 664 : 600;
                                    va = ya ? fa : W
                                } else w = 73
                            } else {
                                wa = 664;
                                va = fa
                            }
                            do
                                if ((w | 0) == 73) {
                                    w = 0;
                                    ya = (Ba << 4) + 616 | 0;
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
                                    Ma = c[u >> 2] | 0;
                                    if (_a(Ma + 224 | 0, Ma + (ya + (d[wa + ((d[I + sa >> 0] << 2) + (d[K + sa >> 0] | 0)) >> 0] | 0)) | 0) | 0) {
                                        a[s + (na & 255) >> 0] = sa;
                                        qa = 0;
                                        na = na + 1 << 24 >> 24
                                    }
                                    sa = sa + -1 | 0
                                } while ((sa | 0) > 0)
                            }
                            if (qa) {
                                a[s + (na & 255) >> 0] = 0;
                                qa = na + 1 << 24 >> 24;
                                break
                            }
                            if (c[(c[r >> 2] | 0) + 13100 >> 2] | 0)
                                if (da ? (a[z >> 0] | 0) == 0 : 0) w = 87;
                                else qa = aa;
                            else w = 87;
                            if ((w | 0) == 87) {
                                w = 0;
                                qa = (ka | 0) == 0 ? _ : va + 2 | 0
                            }
                            Ma = c[u >> 2] | 0;
                            if ((_a(Ma + 224 | 0, Ma + (qa + 92) | 0) | 0) == 1) {
                                a[s + (na & 255) >> 0] = 0;
                                qa = na + 1 << 24 >> 24
                            } else qa = na
                        } else qa = na;
                    while (0);
                    na = qa & 255;
                    a: do
                        if (qa << 24 >> 24) {
                            qa = la ? ba : 0;
                            if (!(c[(c[r >> 2] | 0) + 13116 >> 2] | 0)) Ga = 0;
                            else {
                                if (da ? (a[z >> 0] | 0) == 0 : 0) oa = ma;
                                else oa = ja;
                                Ga = (d[o + oa + 199 >> 0] | 0) >>> 2
                            }
                            sa = qa | (ra | 0) == 0 & (pa ^ 1) & 1;
                            Da = a[s >> 0] | 0;
                            va = Da & 255;
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
                                    La = c[u >> 2] | 0;
                                    Ma = (_a(La + 224 | 0, La + ((R ? Ma + 16 | 0 : Ma) + 136) | 0) | 0) & 255;
                                    a[t + wa >> 0] = Ma;
                                    if (!(Ma << 24 >> 24)) ra = ((ra + -1 | 0) >>> 0 < 2 & 1) + ra | 0;
                                    else {
                                        pa = (pa | 0) == -1 ? wa : pa;
                                        ra = 0
                                    }
                                    wa = wa + 1 | 0
                                } while ((wa | 0) < (qa | 0))
                            }
                            wa = na + -1 | 0;
                            qa = a[s + wa >> 0] | 0;
                            ya = qa & 255;
                            do
                                if (!(a[z >> 0] | 0)) {
                                    if ((c[ea >> 2] | 0) == 1 ? !((c[(c[r >> 2] | 0) + 13104 >> 2] | 0) == 0 | da | (ca | 0) != 10) : 0) {
                                        va = 0;
                                        break
                                    }
                                    va = (va - ya | 0) > 3 & 1
                                } else va = 0;
                            while (0);
                            if ((pa | 0) != -1) {
                                La = c[u >> 2] | 0;
                                La = _a(La + 224 | 0, La + ((R ? sa | 4 : sa) | 160) | 0) | 0;
                                Ma = t + pa | 0;
                                a[Ma >> 0] = (d[Ma >> 0] | 0) + La
                            }
                            sa = (va | 0) == 0;
                            if ((a[(c[ga >> 2] | 0) + 4 >> 0] | 0) == 0 | sa) {
                                wa = 0;
                                va = 0;
                                do {
                                    va = ab((c[u >> 2] | 0) + 224 | 0) | 0 | va << 1;
                                    wa = wa + 1 | 0
                                } while ((wa | 0) < (na | 0));
                                Ba = va << 16 - na
                            } else {
                                va = wa & 255;
                                if (!((wa & 255) << 24 >> 24)) ya = 0;
                                else {
                                    wa = 0;
                                    ya = 0;
                                    do {
                                        ya = ab((c[u >> 2] | 0) + 224 | 0) | 0 | ya << 1;
                                        wa = wa + 1 | 0
                                    } while ((wa | 0) < (va | 0))
                                }
                                Ba = ya << 17 - na
                            }
                            ta = ta << 2;
                            va = ua << 2;
                            ua = o + oa + 199 | 0;
                            wa = 0;
                            Ha = 0;
                            Ca = xa;
                            Fa = 0;
                            while (1) {
                                xa = Da & 255;
                                ya = (d[K + xa >> 0] | 0) + ta | 0;
                                xa = (d[I + xa >> 0] | 0) + va | 0;
                                b: do
                                    if ((wa | 0) < 8) {
                                        Ia = (d[t + wa >> 0] | 0) + 1 | 0;
                                        Ma = (wa | 0) == (pa | 0);
                                        if ((Ia | 0) == ((Ma ? 3 : 2) | 0) & 0 == ((Ma ? 0 : 0) | 0)) Ja = 0;
                                        else {
                                            Ja = 0;
                                            break
                                        }
                                        while (1) {
                                            Ka = Ja + 1 | 0;
                                            if (!(ab((c[u >> 2] | 0) + 224 | 0) | 0)) {
                                                w = 120;
                                                break
                                            }
                                            if ((Ka | 0) < 31) Ja = Ka;
                                            else {
                                                w = 124;
                                                break
                                            }
                                        }
                                        do
                                            if ((w | 0) == 120) {
                                                w = 0;
                                                if ((Ja | 0) >= 3) {
                                                    Ka = Ja;
                                                    w = 124;
                                                    break
                                                }
                                                if ((Ga | 0) > 0) {
                                                    Ka = 0;
                                                    La = 0;
                                                    do {
                                                        La = ab((c[u >> 2] | 0) + 224 | 0) | 0 | La << 1;
                                                        Ka = Ka + 1 | 0
                                                    } while ((Ka | 0) != (Ga | 0))
                                                } else La = 0;
                                                Ka = La + (Ja << Ga) | 0
                                            }
                                        while (0);
                                        if ((w | 0) == 124) {
                                            w = 0;
                                            Ja = Ka + -3 | 0;
                                            if ((Ja + Ga | 0) > 0) {
                                                La = Ga + -3 + Ka | 0;
                                                Ka = 0;
                                                Ma = 0;
                                                do {
                                                    Ma = ab((c[u >> 2] | 0) + 224 | 0) | 0 | Ma << 1;
                                                    Ka = Ka + 1 | 0
                                                } while ((Ka | 0) != (La | 0))
                                            } else Ma = 0;
                                            Ka = Ma + ((1 << Ja) + 2 << Ga) | 0
                                        }
                                        Ia = ae(Ka | 0, ((Ka | 0) < 0) << 31 >> 31 | 0, Ia | 0, 0) | 0;
                                        Ja = D;
                                        La = 3 << Ga;
                                        Na = ((La | 0) < 0) << 31 >> 31;
                                        Ma = c[(c[r >> 2] | 0) + 13116 >> 2] | 0;
                                        do
                                            if ((Ja | 0) > (Na | 0) | (Ja | 0) == (Na | 0) & Ia >>> 0 > La >>> 0) {
                                                La = Ga + 1 | 0;
                                                if (Ma) {
                                                    Ga = La;
                                                    break
                                                }
                                                Ga = (Ga | 0) > 3 ? 4 : La;
                                                break b
                                            }
                                        while (0);
                                        if (!((Ma | 0) != 0 & (Ha | 0) == 0)) break;
                                        Ha = a[ua >> 0] | 0;
                                        La = (Ha & 255) >>> 2;
                                        if ((Ka | 0) >= (3 << La | 0)) {
                                            a[ua >> 0] = Ha + 1 << 24 >> 24;
                                            Ha = 1;
                                            break
                                        }
                                        if ((Ka << 1 | 0) >= (1 << La | 0) | Ha << 24 >> 24 == 0) {
                                            Ha = 1;
                                            break
                                        }
                                        a[ua >> 0] = Ha + -1 << 24 >> 24;
                                        Ha = 1
                                    } else {
                                        Ia = 0;
                                        while (1) {
                                            Ja = Ia + 1 | 0;
                                            if (!(ab((c[u >> 2] | 0) + 224 | 0) | 0)) {
                                                w = 138;
                                                break
                                            }
                                            if ((Ja | 0) < 31) Ia = Ja;
                                            else {
                                                w = 142;
                                                break
                                            }
                                        }
                                        do
                                            if ((w | 0) == 138) {
                                                w = 0;
                                                if ((Ia | 0) >= 3) {
                                                    Ja = Ia;
                                                    w = 142;
                                                    break
                                                }
                                                if ((Ga | 0) > 0) {
                                                    Ja = 0;
                                                    Ka = 0;
                                                    do {
                                                        Ka = ab((c[u >> 2] | 0) + 224 | 0) | 0 | Ka << 1;
                                                        Ja = Ja + 1 | 0
                                                    } while ((Ja | 0) != (Ga | 0))
                                                } else Ka = 0;
                                                Ka = Ka + (Ia << Ga) | 0
                                            }
                                        while (0);
                                        if ((w | 0) == 142) {
                                            w = 0;
                                            Ia = Ja + -3 | 0;
                                            if ((Ia + Ga | 0) > 0) {
                                                Ka = Ga + -3 + Ja | 0;
                                                Ja = 0;
                                                La = 0;
                                                do {
                                                    La = ab((c[u >> 2] | 0) + 224 | 0) | 0 | La << 1;
                                                    Ja = Ja + 1 | 0
                                                } while ((Ja | 0) != (Ka | 0))
                                            } else La = 0;
                                            Ka = La + ((1 << Ia) + 2 << Ga) | 0
                                        }
                                        Ia = Ka + 1 | 0;
                                        Ja = ((Ia | 0) < 0) << 31 >> 31;
                                        Ma = c[(c[r >> 2] | 0) + 13116 >> 2] | 0;
                                        do
                                            if ((Ka | 0) >= (3 << Ga | 0)) {
                                                La = Ga + 1 | 0;
                                                if (Ma) {
                                                    Ga = La;
                                                    break
                                                }
                                                Ga = (Ga | 0) > 3 ? 4 : La;
                                                break b
                                            }
                                        while (0);
                                        if (!((Ma | 0) != 0 & (Ha | 0) == 0)) break;
                                        La = a[ua >> 0] | 0;
                                        Ha = (La & 255) >>> 2;
                                        if ((Ka | 0) >= (3 << Ha | 0)) {
                                            a[ua >> 0] = La + 1 << 24 >> 24;
                                            Ha = 1;
                                            break
                                        }
                                        if ((Ka << 1 | 0) >= (1 << Ha | 0) | La << 24 >> 24 == 0) {
                                            Ha = 1;
                                            break
                                        }
                                        a[ua >> 0] = La + -1 << 24 >> 24;
                                        Ha = 1
                                    }
                                while (0);
                                do
                                    if (!((a[(c[ga >> 2] | 0) + 4 >> 0] | 0) == 0 | sa)) {
                                        Fa = ae(Ia | 0, Ja | 0, Fa | 0, 0) | 0;
                                        if (Da << 24 >> 24 != qa << 24 >> 24) break;
                                        Na = (Fa & 1 | 0) == 0;
                                        Ma = $d(0, 0, Ia | 0, Ja | 0) | 0;
                                        Ia = Na ? Ia : Ma;
                                        Ja = Na ? Ja : D
                                    }
                                while (0);
                                Na = (Ba & 32768 | 0) == 0;
                                Da = $d(0, 0, Ia | 0, Ja | 0) | 0;
                                Da = Na ? Ia : Da;
                                Ia = Na ? Ja : D;
                                Ba = Ba << 1 & 131070;
                                Ja = Da & 65535;
                                do
                                    if (!(a[z >> 0] | 0)) {
                                        do
                                            if (!((a[(c[r >> 2] | 0) + 634 >> 0] | 0) == 0 | ha)) {
                                                if (!((xa | ya | 0) != 0 | k)) {
                                                    Ca = ia;
                                                    break
                                                }
                                                if ((j | 0) == 3) Ca = (xa << 3) + ya | 0;
                                                else if ((j | 0) == 4) Ca = (xa >>> 1 << 3) + (ya >>> 1) | 0;
                                                else if ((j | 0) == 5) Ca = (xa >>> 2 << 3) + (ya >>> 2) | 0;
                                                else Ca = (xa << 2) + ya | 0;
                                                Ca = d[C + Ca >> 0] | 0
                                            }
                                        while (0);
                                        Da = ke(Da | 0, Ia | 0, B | 0, Y | 0) | 0;
                                        Da = ke(Da | 0, D | 0, Ca | 0, ((Ca | 0) < 0) << 31 >> 31 | 0) | 0;
                                        Da = ae(Da | 0, D | 0, A | 0, X | 0) | 0;
                                        Da = _d(Da | 0, D | 0, E | 0) | 0;
                                        Ia = D;
                                        if ((Ia | 0) < 0) {
                                            Ja = (Da & -32768 | 0) == -32768 & (Ia & 268435455 | 0) == 268435455 ? Da & 65535 : -32768;
                                            break
                                        } else {
                                            Ja = Ia >>> 0 > 0 | (Ia | 0) == 0 & Da >>> 0 > 32767 ? 32767 : Da & 65535;
                                            break
                                        }
                                    }
                                while (0);
                                b[p + ((xa << j) + ya << 1) >> 1] = Ja;
                                wa = wa + 1 | 0;
                                if ((wa | 0) >= (na | 0)) {
                                    xa = Ca;
                                    break a
                                }
                                Da = a[s + wa >> 0] | 0
                            }
                        }
                    while (0);
                    if (la) ka = ka + -1 | 0;
                    else break
                }
            }
            do
                if (a[z >> 0] | 0) {
                    if ((c[(c[r >> 2] | 0) + 13104 >> 2] | 0) != 0 ? (x & -17 | 0) == 10 : 0) Ea[c[f + 2632 >> 2] & 7](p, j & 65535, (x | 0) == 26 & 1)
                } else {
                    if (F) {
                        if (((j | 0) == 2 ? (c[(c[r >> 2] | 0) + 13096 >> 2] | 0) != 0 : 0) ? (c[o + 31244 >> 2] | 0) == 1 : 0) {
                            s = 0;
                            do {
                                La = p + (15 - s << 1) | 0;
                                Ma = b[La >> 1] | 0;
                                Na = p + (s << 1) | 0;
                                b[La >> 1] = b[Na >> 1] | 0;
                                b[Na >> 1] = Ma;
                                s = s + 1 | 0
                            } while ((s | 0) != 8)
                        }
                        s = j & 65535;
                        Aa[c[f + 2628 >> 2] & 7](p, s);
                        if (!(c[(c[r >> 2] | 0) + 13104 >> 2] | 0)) break;
                        if ((c[o + 31244 >> 2] | 0) != 1) break;
                        if ((x & -17 | 0) != 10) break;
                        Ea[c[f + 2632 >> 2] & 7](p, s, (x | 0) == 26 & 1);
                        break
                    }
                    if (y & (c[o + 31244 >> 2] | 0) == 1 & (j | 0) == 2) {
                        za[c[f + 2636 >> 2] & 7](p);
                        break
                    }
                    r = (G | 0) > (H | 0) ? G : H;
                    if (!r) {
                        za[c[f + (j + -2 << 2) + 2656 >> 2] & 7](p);
                        break
                    }
                    s = H + 4 + G | 0;
                    do
                        if ((r | 0) >= 4) {
                            if ((r | 0) < 8) {
                                s = (s | 0) < 8 ? s : 8;
                                break
                            }
                            if ((r | 0) < 12) s = (s | 0) < 24 ? s : 24
                        } else s = (s | 0) < 4 ? s : 4;
                    while (0);
                    Aa[c[f + (j + -2 << 2) + 2640 >> 2] & 7](p, s)
                }
            while (0);
            if (!(a[o + 304 >> 0] | 0)) {
                Na = j + -2 | 0;
                Na = f + (Na << 2) + 2612 | 0;
                Na = c[Na >> 2] | 0;
                Ea[Na & 7](h, p, m);
                i = n;
                return
            }
            if ((q | 0) <= 0) {
                Na = j + -2 | 0;
                Na = f + (Na << 2) + 2612 | 0;
                Na = c[Na >> 2] | 0;
                Ea[Na & 7](h, p, m);
                i = n;
                return
            }
            o = c[o + 284 >> 2] | 0;
            r = 0;
            do {
                Na = p + (r << 1) | 0;
                b[Na >> 1] = (($(b[g + (r << 1) >> 1] | 0, o) | 0) >>> 3) + (e[Na >> 1] | 0);
                r = r + 1 | 0
            } while ((r | 0) != (q | 0));
            Na = j + -2 | 0;
            Na = f + (Na << 2) + 2612 | 0;
            Na = c[Na >> 2] | 0;
            Ea[Na & 7](h, p, m);
            i = n;
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
                da = 0;
            j = i;
            i = i + 32 | 0;
            o = j + 8 | 0;
            w = j;
            n = j + 18 | 0;
            r = j + 16 | 0;
            l = e + 200 | 0;
            J = c[l >> 2] | 0;
            u = c[J + 13120 >> 2] | 0;
            k = (u - h | 0) <= (f | 0);
            b[n >> 1] = 0;
            b[r >> 1] = 0;
            v = c[J + 13080 >> 2] | 0;
            t = 1 << v;
            v = ($(g >> v, c[J + 13128 >> 2] | 0) | 0) + (f >> v) | 0;
            s = c[e + 2508 >> 2] | 0;
            m = c[s + (v << 3) + 4 >> 2] | 0;
            x = c[s + (v << 3) >> 2] | 0;
            if ((c[J + 68 >> 2] | 0) != 0 ? (a[J + 13056 >> 0] | 0) != 0 : 0) p = 1;
            else p = (a[(c[e + 204 >> 2] | 0) + 40 >> 0] | 0) != 0;
            q = (f | 0) != 0;
            if (q) {
                v = v + -1 | 0;
                y = c[s + (v << 3) >> 2] | 0;
                v = c[s + (v << 3) + 4 >> 2] | 0
            } else {
                y = 0;
                v = 0
            }
            s = t + f | 0;
            s = (s | 0) > (u | 0) ? u : s;
            t = t + g | 0;
            z = c[J + 13124 >> 2] | 0;
            t = (t | 0) > (z | 0) ? z : t;
            z = (s | 0) == (u | 0) ? s : s + -8 | 0;
            u = (t | 0) > (g | 0);
            if (u) {
                J = q ? f : 8;
                M = (J | 0) < (s | 0);
                P = q ? f + -8 | 0 : 0;
                E = e + 2596 | 0;
                O = e + 4320 | 0;
                H = e + 4316 | 0;
                B = w + 4 | 0;
                C = e + 160 | 0;
                D = n + 1 | 0;
                Q = r + 1 | 0;
                K = e + 4300 | 0;
                L = e + 4284 | 0;
                I = e + 4324 | 0;
                F = e + 4304 | 0;
                G = e + 4288 | 0;
                A = (P | 0) >= (z | 0);
                T = x;
                S = m;
                N = g;
                do {
                    if (M) {
                        R = N + 4 | 0;
                        W = S + -2 & -2;
                        U = J;
                        do {
                            Z = c[E >> 2] | 0;
                            ba = ($(Z, N) | 0) + U >> 2;
                            _ = c[I >> 2] | 0;
                            ba = a[_ + ba >> 0] | 0;
                            ca = ba & 255;
                            Z = a[_ + (($(Z, R) | 0) + U >> 2) >> 0] | 0;
                            _ = Z & 255;
                            ba = ba << 24 >> 24 != 0;
                            Z = Z << 24 >> 24 == 0;
                            do
                                if (!(Z & (ba ^ 1))) {
                                    V = U + -1 | 0;
                                    X = c[l >> 2] | 0;
                                    aa = c[X + 13064 >> 2] | 0;
                                    Y = $(N >> aa, c[X + 13140 >> 2] | 0) | 0;
                                    da = c[H >> 2] | 0;
                                    aa = (a[da + (Y + (V >> aa)) >> 0] | 0) + 1 + (a[da + (Y + (U >> aa)) >> 0] | 0) >> 1;
                                    Y = aa + T | 0;
                                    if ((Y | 0) < 0) Y = 0;
                                    else Y = (Y | 0) > 51 ? 51 : Y;
                                    Y = d[1280 + Y >> 0] | 0;
                                    if (ba) {
                                        ba = (ca << 1) + W + aa | 0;
                                        if ((ba | 0) < 0) ba = 0;
                                        else ba = (ba | 0) > 53 ? 53 : ba;
                                        ba = d[1336 + ba >> 0] | 0
                                    } else ba = 0;
                                    c[w >> 2] = ba;
                                    if (Z) Z = 0;
                                    else {
                                        Z = (_ << 1) + W + aa | 0;
                                        if ((Z | 0) < 0) Z = 0;
                                        else Z = (Z | 0) > 53 ? 53 : Z;
                                        Z = d[1336 + Z >> 0] | 0
                                    }
                                    c[B >> 2] = Z;
                                    ca = c[C >> 2] | 0;
                                    Z = c[ca + 32 >> 2] | 0;
                                    da = $(Z, N) | 0;
                                    X = (c[ca >> 2] | 0) + ((U << c[X + 56 >> 2]) + da) | 0;
                                    if (p) {
                                        a[n >> 0] = Gb(e, V, N) | 0;
                                        a[D >> 0] = Gb(e, V, R) | 0;
                                        a[r >> 0] = Gb(e, U, N) | 0;
                                        a[Q >> 0] = Gb(e, U, R) | 0;
                                        Ha[c[F >> 2] & 3](X, Z, Y, w, n, r);
                                        break
                                    } else {
                                        Ha[c[G >> 2] & 3](X, Z, Y, w, n, r);
                                        break
                                    }
                                }
                            while (0);
                            U = U + 8 | 0
                        } while ((U | 0) < (s | 0))
                    }
                    if (!((N | 0) == 0 | A)) {
                        R = N + -1 | 0;
                        V = S;
                        S = P;
                        do {
                            Y = $(c[E >> 2] | 0, N) | 0;
                            Z = c[O >> 2] | 0;
                            aa = a[Z + (Y + S >> 2) >> 0] | 0;
                            ba = aa & 255;
                            U = S + 4 | 0;
                            Y = a[Z + (Y + U >> 2) >> 0] | 0;
                            Z = Y & 255;
                            aa = aa << 24 >> 24 != 0;
                            Y = Y << 24 >> 24 == 0;
                            do
                                if (!(Y & (aa ^ 1))) {
                                    W = c[l >> 2] | 0;
                                    V = c[W + 13064 >> 2] | 0;
                                    _ = S >> V;
                                    T = c[W + 13140 >> 2] | 0;
                                    da = ($(R >> V, T) | 0) + _ | 0;
                                    X = c[H >> 2] | 0;
                                    _ = (a[X + da >> 0] | 0) + 1 + (a[X + (($(N >> V, T) | 0) + _) >> 0] | 0) >> 1;
                                    T = (S | 0) >= (f | 0);
                                    V = T ? m : v;
                                    T = T ? x : y;
                                    X = _ + T | 0;
                                    if ((X | 0) < 0) X = 0;
                                    else X = (X | 0) > 51 ? 51 : X;
                                    X = d[1280 + X >> 0] | 0;
                                    if (aa) {
                                        aa = (ba << 1) + (V + -2 & -2) + _ | 0;
                                        if ((aa | 0) < 0) aa = 0;
                                        else aa = (aa | 0) > 53 ? 53 : aa;
                                        aa = d[1336 + aa >> 0] | 0
                                    } else aa = 0;
                                    c[w >> 2] = aa;
                                    if (Y) Y = 0;
                                    else {
                                        Y = (Z << 1) + (V + -2 & -2) + _ | 0;
                                        if ((Y | 0) < 0) Y = 0;
                                        else Y = (Y | 0) > 53 ? 53 : Y;
                                        Y = d[1336 + Y >> 0] | 0
                                    }
                                    c[B >> 2] = Y;
                                    ca = c[C >> 2] | 0;
                                    Y = c[ca + 32 >> 2] | 0;
                                    da = $(Y, N) | 0;
                                    W = (c[ca >> 2] | 0) + ((S << c[W + 56 >> 2]) + da) | 0;
                                    if (p) {
                                        a[n >> 0] = Gb(e, S, R) | 0;
                                        a[D >> 0] = Gb(e, U, R) | 0;
                                        a[r >> 0] = Gb(e, S, N) | 0;
                                        a[Q >> 0] = Gb(e, U, N) | 0;
                                        Ha[c[K >> 2] & 3](W, Y, X, w, n, r);
                                        break
                                    } else {
                                        Ha[c[L >> 2] & 3](W, Y, X, w, n, r);
                                        break
                                    }
                                }
                            while (0);
                            S = S + 8 | 0
                        } while ((S | 0) < (z | 0));
                        S = V
                    }
                    N = N + 8 | 0
                } while ((N | 0) < (t | 0));
                J = c[l >> 2] | 0
            } else S = m;
            if (c[J + 4 >> 2] | 0) {
                C = q ? v : m;
                F = e + 2596 | 0;
                D = e + 4320 | 0;
                v = e + 4316 | 0;
                x = o + 4 | 0;
                w = e + 160 | 0;
                B = n + 1 | 0;
                A = r + 1 | 0;
                G = e + 4308 | 0;
                E = e + 4292 | 0;
                H = e + 4324 | 0;
                z = e + 4312 | 0;
                y = e + 4296 | 0;
                I = 1;
                do {
                    O = 1 << c[J + (I << 2) + 13168 >> 2];
                    P = 1 << c[J + (I << 2) + 13180 >> 2];
                    if (u) {
                        N = O << 3;
                        L = q ? f : N;
                        K = (L | 0) < (s | 0);
                        J = P << 3;
                        M = q ? f - N | 0 : 0;
                        O = O << 2;
                        P = P << 2;
                        Q = g;
                        do {
                            if (K) {
                                R = Q + P | 0;
                                T = L;
                                do {
                                    W = c[F >> 2] | 0;
                                    Y = ($(W, Q) | 0) + T >> 2;
                                    da = c[H >> 2] | 0;
                                    Y = (a[da + Y >> 0] | 0) == 2;
                                    W = (a[da + (($(W, R) | 0) + T >> 2) >> 0] | 0) == 2;
                                    do
                                        if (Y | W) {
                                            U = T + -1 | 0;
                                            V = c[l >> 2] | 0;
                                            da = c[V + 13064 >> 2] | 0;
                                            _ = U >> da;
                                            X = c[V + 13140 >> 2] | 0;
                                            Z = $(Q >> da, X) | 0;
                                            aa = c[v >> 2] | 0;
                                            ba = T >> da;
                                            X = $(R >> da, X) | 0;
                                            X = (a[aa + (X + _) >> 0] | 0) + 1 + (a[aa + (X + ba) >> 0] | 0) >> 1;
                                            if (Y) Y = Hb(e, (a[aa + (Z + ba) >> 0] | 0) + 1 + (a[aa + (Z + _) >> 0] | 0) >> 1, I, S) | 0;
                                            else Y = 0;
                                            c[o >> 2] = Y;
                                            if (W) W = Hb(e, X, I, S) | 0;
                                            else W = 0;
                                            c[x >> 2] = W;
                                            ca = c[w >> 2] | 0;
                                            W = c[ca + (I << 2) + 32 >> 2] | 0;
                                            da = $(W, Q >> c[V + (I << 2) + 13180 >> 2]) | 0;
                                            V = (c[ca + (I << 2) >> 2] | 0) + ((T >> c[V + (I << 2) + 13168 >> 2] << c[V + 56 >> 2]) + da) | 0;
                                            if (p) {
                                                a[n >> 0] = Gb(e, U, Q) | 0;
                                                a[B >> 0] = Gb(e, U, R) | 0;
                                                a[r >> 0] = Gb(e, T, Q) | 0;
                                                a[A >> 0] = Gb(e, T, R) | 0;
                                                ya[c[z >> 2] & 3](V, W, o, n, r);
                                                break
                                            } else {
                                                ya[c[y >> 2] & 3](V, W, o, n, r);
                                                break
                                            }
                                        }
                                    while (0);
                                    T = T + N | 0
                                } while ((T | 0) < (s | 0))
                            }
                            if (Q) {
                                U = s - ((s | 0) == (c[(c[l >> 2] | 0) + 13120 >> 2] | 0) ? 0 : N) | 0;
                                if ((M | 0) < (U | 0)) {
                                    T = Q + -1 | 0;
                                    S = M;
                                    do {
                                        W = $(c[F >> 2] | 0, Q) | 0;
                                        da = c[D >> 2] | 0;
                                        R = S + O | 0;
                                        X = (a[da + (W + S >> 2) >> 0] | 0) == 2;
                                        W = (a[da + (W + R >> 2) >> 0] | 0) == 2;
                                        do
                                            if (X | W) {
                                                if (X) {
                                                    da = c[l >> 2] | 0;
                                                    ca = c[da + 13064 >> 2] | 0;
                                                    Y = S >> ca;
                                                    da = c[da + 13140 >> 2] | 0;
                                                    aa = ($(T >> ca, da) | 0) + Y | 0;
                                                    ba = c[v >> 2] | 0;
                                                    Y = (a[ba + aa >> 0] | 0) + 1 + (a[ba + (($(Q >> ca, da) | 0) + Y) >> 0] | 0) >> 1
                                                } else Y = 0;
                                                if (W) {
                                                    da = c[l >> 2] | 0;
                                                    ca = c[da + 13064 >> 2] | 0;
                                                    V = R >> ca;
                                                    da = c[da + 13140 >> 2] | 0;
                                                    aa = ($(T >> ca, da) | 0) + V | 0;
                                                    ba = c[v >> 2] | 0;
                                                    V = (a[ba + aa >> 0] | 0) + 1 + (a[ba + (($(Q >> ca, da) | 0) + V) >> 0] | 0) >> 1
                                                } else V = 0;
                                                if (X) X = Hb(e, Y, I, C) | 0;
                                                else X = 0;
                                                c[o >> 2] = X;
                                                if (W) V = Hb(e, V, I, m) | 0;
                                                else V = 0;
                                                c[x >> 2] = V;
                                                da = c[l >> 2] | 0;
                                                ca = c[w >> 2] | 0;
                                                V = c[ca + (I << 2) + 32 >> 2] | 0;
                                                W = $(V, Q >> c[da + 13184 >> 2]) | 0;
                                                W = (c[ca + (I << 2) >> 2] | 0) + ((S >> c[da + 13172 >> 2] << c[da + 56 >> 2]) + W) | 0;
                                                if (p) {
                                                    a[n >> 0] = Gb(e, S, T) | 0;
                                                    a[B >> 0] = Gb(e, R, T) | 0;
                                                    a[r >> 0] = Gb(e, S, Q) | 0;
                                                    a[A >> 0] = Gb(e, R, Q) | 0;
                                                    ya[c[G >> 2] & 3](W, V, o, n, r);
                                                    break
                                                } else {
                                                    ya[c[E >> 2] & 3](W, V, o, n, r);
                                                    break
                                                }
                                            }
                                        while (0);
                                        S = S + N | 0
                                    } while ((S | 0) < (U | 0));
                                    S = C
                                } else S = C
                            }
                            Q = Q + J | 0
                        } while ((Q | 0) < (t | 0))
                    }
                    I = I + 1 | 0;
                    J = c[l >> 2] | 0
                } while ((I | 0) != 3)
            }
            if (!(a[J + 12941 >> 0] | 0)) {
                if ((a[e + 140 >> 0] & 1) == 0 | k ^ 1) {
                    i = j;
                    return
                }
                i = j;
                return
            }
            n = (c[J + 13124 >> 2] | 0) - h | 0;
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
            v = i;
            i = i + 48 | 0;
            j = v + 24 | 0;
            h = v + 42 | 0;
            u = v + 40 | 0;
            r = v + 16 | 0;
            n = v + 8 | 0;
            m = v;
            k = e + 200 | 0;
            S = c[k >> 2] | 0;
            s = c[S + 13080 >> 2] | 0;
            q = f >> s;
            s = g >> s;
            D = S + 13128 | 0;
            p = ($(s, c[D >> 2] | 0) | 0) + q | 0;
            L = c[e + 204 >> 2] | 0;
            N = L + 1668 | 0;
            M = c[(c[N >> 2] | 0) + (p << 2) >> 2] | 0;
            l = e + 2504 | 0;
            o = c[l >> 2] | 0;
            t = o + (p * 148 | 0) | 0;
            b[h >> 1] = 0;
            b[u >> 1] = 0;
            c[r >> 2] = 0;
            E = ($(c[D >> 2] | 0, s) | 0) + q | 0;
            E = a[(c[e + 4352 >> 2] | 0) + E >> 0] | 0;
            if ((a[L + 42 >> 0] | 0) != 0 ? (a[L + 53 >> 0] | 0) == 0 : 0) {
                R = 1;
                O = 1
            } else {
                R = E << 24 >> 24 == 0 & 1;
                O = 0
            }
            G = (q | 0) == 0;
            c[j >> 2] = G & 1;
            I = (s | 0) == 0;
            A = j + 4 | 0;
            c[A >> 2] = I & 1;
            H = (q | 0) == ((c[D >> 2] | 0) + -1 | 0);
            z = j + 8 | 0;
            c[z >> 2] = H & 1;
            F = (s | 0) == ((c[S + 13132 >> 2] | 0) + -1 | 0);
            w = j + 12 | 0;
            c[w >> 2] = F & 1;
            if (R << 24 >> 24) {
                if (G) J = 0;
                else {
                    if (O) {
                        J = c[L + 1676 >> 2] | 0;
                        J = (c[J + (M << 2) >> 2] | 0) != (c[J + (c[(c[N >> 2] | 0) + (p + -1 << 2) >> 2] << 2) >> 2] | 0) & 1
                    } else J = 0;
                    if (E << 24 >> 24 == 0 ? (pa = $(c[D >> 2] | 0, s) | 0, oa = c[e + 4328 >> 2] | 0, (c[oa + (pa + q << 2) >> 2] | 0) != (c[oa + (q + -1 + pa << 2) >> 2] | 0)) : 0) K = 1;
                    else K = J;
                    a[h >> 0] = K
                }
                if (H) K = 0;
                else {
                    if (O) {
                        K = c[L + 1676 >> 2] | 0;
                        K = (c[K + (M << 2) >> 2] | 0) != (c[K + (c[(c[N >> 2] | 0) + (p + 1 << 2) >> 2] << 2) >> 2] | 0) & 1
                    } else K = 0;
                    if (E << 24 >> 24 == 0 ? (pa = $(c[D >> 2] | 0, s) | 0, oa = c[e + 4328 >> 2] | 0, (c[oa + (pa + q << 2) >> 2] | 0) != (c[oa + (q + 1 + pa << 2) >> 2] | 0)) : 0) P = 1;
                    else P = K;
                    a[h + 1 >> 0] = P
                }
                if (I) P = 0;
                else {
                    if (O) {
                        P = c[L + 1676 >> 2] | 0;
                        P = (c[P + (M << 2) >> 2] | 0) != (c[P + (c[(c[N >> 2] | 0) + (p - (c[D >> 2] | 0) << 2) >> 2] << 2) >> 2] | 0) & 1
                    } else P = 0;
                    if (E << 24 >> 24 == 0 ? (pa = c[D >> 2] | 0, na = ($(pa, s) | 0) + q | 0, oa = c[e + 4328 >> 2] | 0, (c[oa + (na << 2) >> 2] | 0) != (c[oa + (($(pa, s + -1 | 0) | 0) + q << 2) >> 2] | 0)) : 0) Q = 1;
                    else Q = P;
                    a[u >> 0] = Q
                }
                if (F) L = 0;
                else {
                    if (O) {
                        L = c[L + 1676 >> 2] | 0;
                        L = (c[L + (M << 2) >> 2] | 0) != (c[L + (c[(c[N >> 2] | 0) + ((c[D >> 2] | 0) + p << 2) >> 2] << 2) >> 2] | 0) & 1
                    } else L = 0;
                    if (E << 24 >> 24 == 0 ? (pa = c[D >> 2] | 0, na = ($(pa, s) | 0) + q | 0, oa = c[e + 4328 >> 2] | 0, (c[oa + (na << 2) >> 2] | 0) != (c[oa + (($(pa, s + 1 | 0) | 0) + q << 2) >> 2] | 0)) : 0) M = 1;
                    else M = L;
                    a[u + 1 >> 0] = M
                }
                if (!G)
                    if (I) B = 47;
                    else {
                        if (!(E << 24 >> 24)) {
                            pa = c[D >> 2] | 0;
                            na = ($(pa, s) | 0) + q | 0;
                            oa = c[e + 4328 >> 2] | 0;
                            if (J << 24 >> 24 == 0 ? (c[oa + (na << 2) >> 2] | 0) == (c[oa + (q + -1 + ($(pa, s + -1 | 0) | 0) << 2) >> 2] | 0) : 0) B = 38;
                            else M = 1
                        } else if (!(J << 24 >> 24)) B = 38;
                        else M = 1;
                        if ((B | 0) == 38) M = P << 24 >> 24 != 0 & 1;
                        a[r >> 0] = M;
                        B = 40
                    } else B = 40;
                if ((B | 0) == 40)
                    if (!I) {
                        if (!H) {
                            if (!(E << 24 >> 24)) {
                                pa = c[D >> 2] | 0;
                                na = ($(pa, s) | 0) + q | 0;
                                oa = c[e + 4328 >> 2] | 0;
                                if (K << 24 >> 24 == 0 ? (c[oa + (na << 2) >> 2] | 0) == (c[oa + (q + 1 + ($(pa, s + -1 | 0) | 0) << 2) >> 2] | 0) : 0) B = 45;
                                else I = 1
                            } else if (!(K << 24 >> 24)) B = 45;
                            else I = 1;
                            if ((B | 0) == 45) I = P << 24 >> 24 != 0 & 1;
                            a[r + 1 >> 0] = I;
                            B = 47
                        }
                    } else B = 47;
                if ((B | 0) == 47 ? !(H | F) : 0) {
                    if (!(E << 24 >> 24)) {
                        pa = c[D >> 2] | 0;
                        na = ($(pa, s) | 0) + q | 0;
                        oa = c[e + 4328 >> 2] | 0;
                        if (K << 24 >> 24 == 0 ? (c[oa + (na << 2) >> 2] | 0) == (c[oa + (q + 1 + ($(pa, s + 1 | 0) | 0) << 2) >> 2] | 0) : 0) B = 51;
                        else H = 1
                    } else if (!(K << 24 >> 24)) B = 51;
                    else H = 1;
                    if ((B | 0) == 51) H = L << 24 >> 24 != 0 & 1;
                    a[r + 2 >> 0] = H
                }
                if (!(G | F)) {
                    if (!(E << 24 >> 24)) {
                        pa = c[D >> 2] | 0;
                        na = ($(pa, s) | 0) + q | 0;
                        oa = c[e + 4328 >> 2] | 0;
                        if (J << 24 >> 24 == 0 ? (c[oa + (na << 2) >> 2] | 0) == (c[oa + (q + -1 + ($(pa, s + 1 | 0) | 0) << 2) >> 2] | 0) : 0) B = 57;
                        else D = 1
                    } else if (!(J << 24 >> 24)) B = 57;
                    else D = 1;
                    if ((B | 0) == 57) D = L << 24 >> 24 != 0 & 1;
                    a[r + 3 >> 0] = D
                }
            }
            O = (c[S + 4 >> 2] | 0) != 0 ? 3 : 1;
            I = e + 160 | 0;
            H = e + 168 | 0;
            P = e + 2672 | 0;
            J = s << 1;
            G = J + -1 | 0;
            D = n + 4 | 0;
            E = s + -1 | 0;
            Q = q + 1 | 0;
            L = q + -1 | 0;
            J = J + 2 | 0;
            F = m + 4 | 0;
            K = s + 1 | 0;
            N = q << 1;
            M = N + -1 | 0;
            N = N + 2 | 0;
            R = e + ((R & 255) << 2) + 2676 | 0;
            na = S;
            Y = 0;
            while (1) {
                ka = c[na + (Y << 2) + 13168 >> 2] | 0;
                _ = f >> ka;
                ha = c[na + (Y << 2) + 13180 >> 2] | 0;
                Z = g >> ha;
                ba = c[I >> 2] | 0;
                S = c[ba + (Y << 2) + 32 >> 2] | 0;
                U = 1 << c[na + 13080 >> 2];
                X = U >> ka;
                W = U >> ha;
                ka = c[na + 13120 >> 2] >> ka;
                ca = ka - _ | 0;
                X = (X | 0) > (ca | 0) ? ca : X;
                ha = c[na + 13124 >> 2] >> ha;
                ca = ha - Z | 0;
                W = (W | 0) > (ca | 0) ? ca : W;
                ca = $(S, Z) | 0;
                ga = c[na + 56 >> 2] | 0;
                ca = (_ << ga) + ca | 0;
                ba = c[ba + (Y << 2) >> 2] | 0;
                aa = ba + ca | 0;
                U = U + 2 << ga;
                da = c[H >> 2] | 0;
                fa = 1 << ga;
                ea = U + fa | 0;
                V = da + ea | 0;
                T = o + (p * 148 | 0) + Y + 142 | 0;
                ia = d[T >> 0] | 0;
                if ((ia | 0) == 1) {
                    ea = X << ga;
                    if ((W | 0) > 0) {
                        da = V;
                        ba = 0;
                        ca = aa;
                        while (1) {
                            fe(da | 0, ca | 0, ea | 0) | 0;
                            ba = ba + 1 | 0;
                            if ((ba | 0) == (W | 0)) break;
                            else {
                                da = da + U | 0;
                                ca = ca + S | 0
                            }
                        }
                    }
                    Eb(e, aa, S, _, Z, X, W, Y, q, s);
                    Fa[c[P >> 2] & 1](aa, V, S, U, t, j, X, W, Y);
                    Fb(e, aa, V, S, U, f, g, X, W, Y);
                    a[T >> 0] = 3
                } else if ((ia | 0) == 2) {
                    ja = c[j >> 2] | 0;
                    ia = c[z >> 2] | 0;
                    la = c[w >> 2] | 0;
                    do
                        if (!(c[A >> 2] | 0)) {
                            pa = 1 - ja | 0;
                            oa = pa << ga;
                            ma = fa - oa | 0;
                            c[n >> 2] = ba + (ca - S - oa);
                            c[D >> 2] = (c[e + (Y << 2) + 172 >> 2] | 0) + (($(ka, G) | 0) + _ - pa << ga);
                            do
                                if ((ja | 0) != 1) {
                                    oa = da + ma | 0;
                                    pa = L + ($(c[na + 13128 >> 2] | 0, E) | 0) | 0;
                                    pa = c[n + (((a[(c[l >> 2] | 0) + (pa * 148 | 0) + Y + 142 >> 0] | 0) == 3 & 1) << 2) >> 2] | 0;
                                    if (!ga) {
                                        a[oa >> 0] = a[pa >> 0] | 0;
                                        na = c[k >> 2] | 0;
                                        oa = fa;
                                        break
                                    } else {
                                        b[oa >> 1] = b[pa >> 1] | 0;
                                        oa = fa;
                                        break
                                    }
                                } else oa = 0;
                            while (0);
                            pa = ($(c[na + 13128 >> 2] | 0, E) | 0) + q | 0;
                            na = X << ga;
                            fe(da + (oa + ma) | 0, (c[n + (((a[(c[l >> 2] | 0) + (pa * 148 | 0) + Y + 142 >> 0] | 0) == 3 & 1) << 2) >> 2] | 0) + oa | 0, na | 0) | 0;
                            if ((ia | 0) != 1) {
                                na = oa + na | 0;
                                pa = Q + ($(c[(c[k >> 2] | 0) + 13128 >> 2] | 0, E) | 0) | 0;
                                ma = da + (na + ma) | 0;
                                na = (c[n + (((a[(c[l >> 2] | 0) + (pa * 148 | 0) + Y + 142 >> 0] | 0) == 3 & 1) << 2) >> 2] | 0) + na | 0;
                                if (!ga) {
                                    a[ma >> 0] = a[na >> 0] | 0;
                                    break
                                } else {
                                    b[ma >> 1] = b[na >> 1] | 0;
                                    break
                                }
                            }
                        }
                    while (0);
                    do
                        if (!la) {
                            pa = 1 - ja | 0;
                            oa = pa << ga;
                            la = ($(W, U) | 0) + ea - oa | 0;
                            c[m >> 2] = ba + (($(W, S) | 0) + ca - oa);
                            c[F >> 2] = (c[e + (Y << 2) + 172 >> 2] | 0) + (($(ka, J) | 0) + _ - pa << ga);
                            do
                                if ((ja | 0) != 1) {
                                    ka = da + la | 0;
                                    ma = L + ($(c[(c[k >> 2] | 0) + 13128 >> 2] | 0, K) | 0) | 0;
                                    ma = c[m + (((a[(c[l >> 2] | 0) + (ma * 148 | 0) + Y + 142 >> 0] | 0) == 3 & 1) << 2) >> 2] | 0;
                                    if (!ga) {
                                        a[ka >> 0] = a[ma >> 0] | 0;
                                        ka = fa;
                                        break
                                    } else {
                                        b[ka >> 1] = b[ma >> 1] | 0;
                                        ka = fa;
                                        break
                                    }
                                } else ka = 0;
                            while (0);
                            pa = ($(c[(c[k >> 2] | 0) + 13128 >> 2] | 0, K) | 0) + q | 0;
                            ma = X << ga;
                            fe(da + (ka + la) | 0, (c[m + (((a[(c[l >> 2] | 0) + (pa * 148 | 0) + Y + 142 >> 0] | 0) == 3 & 1) << 2) >> 2] | 0) + ka | 0, ma | 0) | 0;
                            if ((ia | 0) != 1) {
                                ka = ka + ma | 0;
                                pa = Q + ($(c[(c[k >> 2] | 0) + 13128 >> 2] | 0, K) | 0) | 0;
                                la = da + (ka + la) | 0;
                                ka = (c[m + (((a[(c[l >> 2] | 0) + (pa * 148 | 0) + Y + 142 >> 0] | 0) == 3 & 1) << 2) >> 2] | 0) + ka | 0;
                                if (!ga) {
                                    a[la >> 0] = a[ka >> 0] | 0;
                                    break
                                } else {
                                    b[la >> 1] = b[ka >> 1] | 0;
                                    break
                                }
                            }
                        }
                    while (0);
                    do
                        if (!ja) {
                            pa = L + ($(c[(c[k >> 2] | 0) + 13128 >> 2] | 0, s) | 0) | 0;
                            if ((a[(c[l >> 2] | 0) + (pa * 148 | 0) + Y + 142 >> 0] | 0) == 3) {
                                la = da + U | 0;
                                ja = (c[e + (Y << 2) + 184 >> 2] | 0) + (($(ha, M) | 0) + Z << ga) | 0;
                                ka = (W | 0) > 0;
                                if (!ga) {
                                    if (ka) ka = 0;
                                    else {
                                        ja = 0;
                                        break
                                    }
                                    while (1) {
                                        a[la >> 0] = a[ja >> 0] | 0;
                                        ka = ka + 1 | 0;
                                        if ((ka | 0) == (W | 0)) {
                                            ja = 0;
                                            break
                                        } else {
                                            la = la + U | 0;
                                            ja = ja + fa | 0
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
                                        if ((ka | 0) == (W | 0)) {
                                            ja = 0;
                                            break
                                        } else {
                                            la = la + U | 0;
                                            ja = ja + fa | 0
                                        }
                                    }
                                }
                            } else ja = 1
                        } else ja = 0;
                    while (0);
                    do
                        if (!ia) {
                            pa = Q + ($(c[(c[k >> 2] | 0) + 13128 >> 2] | 0, s) | 0) | 0;
                            if ((a[(c[l >> 2] | 0) + (pa * 148 | 0) + Y + 142 >> 0] | 0) == 3) {
                                ia = da + ((X << ga) + ea) | 0;
                                ha = (c[e + (Y << 2) + 184 >> 2] | 0) + (($(ha, N) | 0) + Z << ga) | 0;
                                ka = (W | 0) > 0;
                                if (!ga) {
                                    if (ka) B = 0;
                                    else break;
                                    while (1) {
                                        a[ia >> 0] = a[ha >> 0] | 0;
                                        B = B + 1 | 0;
                                        if ((B | 0) == (W | 0)) {
                                            C = 0;
                                            B = 96;
                                            break
                                        } else {
                                            ia = ia + U | 0;
                                            ha = ha + fa | 0
                                        }
                                    }
                                } else {
                                    if (ka) B = 0;
                                    else break;
                                    while (1) {
                                        b[ia >> 1] = b[ha >> 1] | 0;
                                        B = B + 1 | 0;
                                        if ((B | 0) == (W | 0)) {
                                            C = 0;
                                            B = 96;
                                            break
                                        } else {
                                            ia = ia + U | 0;
                                            ha = ha + fa | 0
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
                    if ((B | 0) == 96 ? (B = 0, x = ja << ga, y = ja + X + C << ga, (W | 0) > 0) : 0) {
                        ea = da + (ea - x) | 0;
                        da = 0;
                        ba = ba + (ca - x) | 0;
                        while (1) {
                            fe(ea | 0, ba | 0, y | 0) | 0;
                            da = da + 1 | 0;
                            if ((da | 0) == (W | 0)) break;
                            else {
                                ea = ea + U | 0;
                                ba = ba + S | 0
                            }
                        }
                    }
                    Eb(e, aa, S, _, Z, X, W, Y, q, s);
                    Ca[c[R >> 2] & 3](aa, V, S, U, t, j, X, W, Y, h, u, r);
                    Fb(e, aa, V, S, U, f, g, X, W, Y);
                    a[T >> 0] = 3
                }
                Y = Y + 1 | 0;
                if ((Y | 0) >= (O | 0)) break;
                na = c[k >> 2] | 0
            }
            i = v;
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
                Ca = 0,
                Da = 0,
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
                        Aa = m + 1448 | 0;
                        ba = m + 2046 | 0;
                        _ = m + 1428 | 0;
                        za = m + 204 | 0;
                        qa = m + 200 | 0;
                        Ia = m + 1449 | 0;
                        Ja = m + 1432 | 0;
                        Na = m + 1436 | 0;
                        Oa = m + 2580 | 0;
                        Ga = m + 156 | 0;
                        Da = m + 1440 | 0;
                        I = m + 1450 | 0;
                        L = m + 1620 | 0;
                        pa = m + 2572 | 0;
                        K = m + 2516 | 0;
                        M = m + 2576 | 0;
                        W = m + 2056 | 0;
                        X = m + 2057 | 0;
                        N = m + 2058 | 0;
                        P = m + 2052 | 0;
                        O = m + 2048 | 0;
                        La = m + 2068 | 0;
                        S = m + 2072 | 0;
                        Q = m + 2076 | 0;
                        T = m + 2080 | 0;
                        Y = m + 2061 | 0;
                        V = m + 2084 | 0;
                        U = m + 2088 | 0;
                        Z = m + 2062 | 0;
                        J = m + 1451 | 0;
                        Ma = m + 2108 | 0;
                        Ha = m + 2112 | 0;
                        Ka = m + 2500 | 0;
                        Ca = m + 2592 | 0;
                        ma = m + 2604 | 0;
                        na = m + 4416 | 0;
                        aa = q + 4 | 0;
                        ra = m + 4320 | 0;
                        ua = m + 2596 | 0;
                        sa = m + 2600 | 0;
                        va = m + 4324 | 0;
                        wa = m + 4344 | 0;
                        xa = m + 4348 | 0;
                        ya = m + 4328 | 0;
                        oa = m + 160 | 0;
                        Fa = m + 140 | 0;
                        Ea = m + 164 | 0;
                        R = m + 2096 | 0;
                        F = m + 2100 | 0;
                        E = m + 2104 | 0;
                        G = m + 141 | 0;
                        H = m + 4368 | 0;
                        da = m + 2504 | 0;
                        ca = m + 2508 | 0;
                        fa = m + 4332 | 0;
                        ea = m + 4336 | 0;
                        ga = m + 4340 | 0;
                        ia = m + 4352 | 0;
                        ha = m + 4316 | 0;
                        ja = m + 2608 | 0;
                        Pa = m + 196 | 0;
                        Qa = m + 4364 | 0;
                        ka = m + 168 | 0;
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
                                                        a[Aa >> 0] = _a;
                                                        Ta = c[t >> 2] | 0;
                                                        if (!((Ta + -16 | 0) >>> 0 > 4 | _a << 24 >> 24 == 0) ? (b[Qa >> 1] = (e[Qa >> 1] | 0) + 1 & 255, c[Ca >> 2] = 2147483647, (Ta + -19 | 0) >>> 0 < 2) : 0) {
                                                            Yb(m);
                                                            Ta = c[t >> 2] | 0
                                                        }
                                                        a[ba >> 0] = 0;
                                                        if ((Ta + -16 | 0) >>> 0 < 8) a[ba >> 0] = bd(Sa) | 0;
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
                                                        if (!(a[Aa >> 0] | 0)) {
                                                            Wa = c[Ta + 4 >> 2] | 0;
                                                            if ((c[za >> 2] | 0) != (Wa | 0)) {
                                                                p = B;
                                                                o = 180;
                                                                break a
                                                            }
                                                        } else Wa = c[Ta + 4 >> 2] | 0;
                                                        c[za >> 2] = Wa;
                                                        Ua = c[t >> 2] | 0;
                                                        Va = (Ua | 0) == 21;
                                                        if (Va ? (c[A >> 2] | 0) == 1 : 0) a[ba >> 0] = 1;
                                                        Ta = c[qa >> 2] | 0;
                                                        Wa = c[(c[m + (c[Wa >> 2] << 2) + 272 >> 2] | 0) + 4 >> 2] | 0;
                                                        if ((Ta | 0) != (Wa | 0)) {
                                                            c[qa >> 2] = Wa;
                                                            e: do
                                                                if (Ta) {
                                                                    if ((Ua + -16 | 0) >>> 0 > 7 | Va) break;
                                                                    do
                                                                        if ((c[Wa + 13120 >> 2] | 0) == (c[Ta + 13120 >> 2] | 0)) {
                                                                            if ((c[Wa + 13124 >> 2] | 0) != (c[Ta + 13124 >> 2] | 0)) break;
                                                                            if ((c[Wa + 76 + (((c[Wa + 72 >> 2] | 0) + -1 | 0) * 12 | 0) >> 2] | 0) == (c[Ta + (((c[Ta + 72 >> 2] | 0) + -1 | 0) * 12 | 0) + 76 >> 2] | 0)) break e
                                                                        }
                                                                    while (0);
                                                                    a[ba >> 0] = 0
                                                                }
                                                            while (0);
                                                            Yb(m);
                                                            Ta = c[qa >> 2] | 0;
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
                                                            c[ua >> 2] = (ab >> 2) + 1;
                                                            c[sa >> 2] = ($a >> 2) + 1;
                                                            c[da >> 2] = pd(Ua, 148) | 0;
                                                            $a = pd(Ua, 8) | 0;
                                                            c[ca >> 2] = $a;
                                                            if ((c[da >> 2] | 0) == 0 | ($a | 0) == 0) {
                                                                o = 71;
                                                                break b
                                                            }
                                                            $a = Ta + 13144 | 0;
                                                            ab = Ta + 13140 | 0;
                                                            c[fa >> 2] = fd($(c[ab >> 2] | 0, c[$a >> 2] | 0) | 0) | 0;
                                                            ab = od(c[$a >> 2] | 0, c[ab >> 2] | 0) | 0;
                                                            c[ea >> 2] = ab;
                                                            if ((c[fa >> 2] | 0) == 0 | (ab | 0) == 0) {
                                                                o = 71;
                                                                break b
                                                            }
                                                            c[wa >> 2] = od(c[Ta + 13148 >> 2] | 0, c[Ta + 13152 >> 2] | 0) | 0;
                                                            c[ga >> 2] = md(Ya) | 0;
                                                            Ya = fd($((c[Za >> 2] | 0) + 1 | 0, (c[_a >> 2] | 0) + 1 | 0) | 0) | 0;
                                                            c[xa >> 2] = Ya;
                                                            if (!(c[ga >> 2] | 0)) {
                                                                o = 71;
                                                                break b
                                                            }
                                                            if ((c[wa >> 2] | 0) == 0 | (Ya | 0) == 0) {
                                                                o = 71;
                                                                break b
                                                            }
                                                            c[ia >> 2] = fd(Ua) | 0;
                                                            c[ya >> 2] = od(Va, 4) | 0;
                                                            ab = od(Va, 1) | 0;
                                                            c[ha >> 2] = ab;
                                                            if (!ab) {
                                                                o = 71;
                                                                break b
                                                            }
                                                            if (!(c[ia >> 2] | 0)) {
                                                                o = 71;
                                                                break b
                                                            }
                                                            if (!(c[ya >> 2] | 0)) {
                                                                o = 71;
                                                                break b
                                                            }
                                                            c[ra >> 2] = pd(c[ua >> 2] | 0, c[sa >> 2] | 0) | 0;
                                                            ab = pd(c[ua >> 2] | 0, c[sa >> 2] | 0) | 0;
                                                            c[va >> 2] = ab;
                                                            if ((c[ra >> 2] | 0) == 0 | (ab | 0) == 0) {
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
                                                            bc(ja, c[Ta + 52 >> 2] | 0);
                                                            if (a[Ta + 12941 >> 0] | 0) {
                                                                Ua = c[qa >> 2] | 0;
                                                                Va = (c[Ua + 4 >> 2] | 0) != 0 ? 3 : 1;
                                                                ab = (1 << c[Ua + 13080 >> 2]) + 2 | 0;
                                                                ab = $(ab, ab) | 0;
                                                                c[ka >> 2] = fd(ab << c[Ua + 56 >> 2]) | 0;
                                                                Ua = 0;
                                                                do {
                                                                    ab = c[qa >> 2] | 0;
                                                                    $a = c[ab + 13124 >> 2] >> c[ab + (Ua << 2) + 13180 >> 2];
                                                                    _a = $(c[ab + 13120 >> 2] >> c[ab + (Ua << 2) + 13168 >> 2] << 1, c[ab + 13132 >> 2] | 0) | 0;
                                                                    c[m + (Ua << 2) + 172 >> 2] = fd(_a << c[ab + 56 >> 2]) | 0;
                                                                    ab = c[qa >> 2] | 0;
                                                                    $a = $($a << 1, c[ab + 13128 >> 2] | 0) | 0;
                                                                    c[m + (Ua << 2) + 184 >> 2] = fd($a << c[ab + 56 >> 2]) | 0;
                                                                    Ua = Ua + 1 | 0
                                                                } while ((Ua | 0) < (Va | 0))
                                                            }
                                                            c[qa >> 2] = Ta;
                                                            c[Pa >> 2] = c[(c[m + (c[Ta >> 2] << 2) + 208 >> 2] | 0) + 4 >> 2];
                                                            b[Qa >> 1] = (e[Qa >> 1] | 0) + 1 & 255;
                                                            c[Ca >> 2] = 2147483647
                                                        }
                                                        ab = c[la >> 2] | 0;
                                                        c[ab + 832 >> 2] = d[Ta + 302 >> 0];
                                                        c[ab + 836 >> 2] = d[Ta + 335 >> 0];
                                                        a[Ia >> 0] = 0;
                                                        do
                                                            if (!(a[Aa >> 0] | 0)) {
                                                                if (a[(c[za >> 2] | 0) + 41 >> 0] | 0) {
                                                                    a[Ia >> 0] = bd(Sa) | 0;
                                                                    Ta = c[qa >> 2] | 0
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
                                                                c[Ja >> 2] = Ta;
                                                                ab = c[qa >> 2] | 0;
                                                                if (Ta >>> 0 >= ($(c[ab + 13132 >> 2] | 0, c[ab + 13128 >> 2] | 0) | 0) >>> 0) {
                                                                    p = B;
                                                                    o = 180;
                                                                    break a
                                                                }
                                                                if (a[Ia >> 0] | 0)
                                                                    if (!(a[Ga >> 0] | 0)) {
                                                                        p = B;
                                                                        o = 180;
                                                                        break a
                                                                    } else break;
                                                                else {
                                                                    c[Na >> 2] = Ta;
                                                                    c[Oa >> 2] = (c[Oa >> 2] | 0) + 1;
                                                                    o = 82;
                                                                    break
                                                                }
                                                            } else {
                                                                c[Na >> 2] = 0;
                                                                c[Ja >> 2] = 0;
                                                                c[Oa >> 2] = 0;
                                                                a[Ga >> 0] = 0;
                                                                o = 82
                                                            }
                                                        while (0);
                                                        f: do
                                                            if ((o | 0) == 82) {
                                                                o = 0;
                                                                a[Ga >> 0] = 0;
                                                                if ((c[(c[za >> 2] | 0) + 1624 >> 2] | 0) > 0) {
                                                                    Ta = 0;
                                                                    do {
                                                                        ad(Sa, 1);
                                                                        Ta = Ta + 1 | 0
                                                                    } while ((Ta | 0) < (c[(c[za >> 2] | 0) + 1624 >> 2] | 0))
                                                                }
                                                                Ta = dd(Sa) | 0;
                                                                c[Da >> 2] = Ta;
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
                                                                if (a[(c[za >> 2] | 0) + 39 >> 0] | 0) a[I >> 0] = bd(Sa) | 0;
                                                                if (a[(c[qa >> 2] | 0) + 8 >> 0] | 0) a[J >> 0] = _c(Sa, 2) | 0;
                                                                if (((c[t >> 2] | 0) + -19 | 0) >>> 0 >= 2) {
                                                                    o = 91;
                                                                    break b
                                                                }
                                                                c[L >> 2] = 0;
                                                                c[pa >> 2] = 0;
                                                                if (!(c[K >> 2] | 0)) c[M >> 2] = 0;
                                                                do
                                                                    if (a[(c[qa >> 2] | 0) + 12941 >> 0] | 0) {
                                                                        a[W >> 0] = bd(Sa) | 0;
                                                                        if (!(c[(c[qa >> 2] | 0) + 4 >> 2] | 0)) {
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
                                                                c[La >> 2] = ed(Sa) | 0;
                                                                Ta = c[za >> 2] | 0;
                                                                if (!(a[Ta + 36 >> 0] | 0)) {
                                                                    c[S >> 2] = 0;
                                                                    c[Q >> 2] = 0
                                                                } else {
                                                                    c[S >> 2] = ed(Sa) | 0;
                                                                    c[Q >> 2] = ed(Sa) | 0;
                                                                    Ta = c[za >> 2] | 0
                                                                }
                                                                if (!(a[Ta + 1631 >> 0] | 0)) a[T >> 0] = 0;
                                                                else {
                                                                    a[T >> 0] = bd(Sa) | 0;
                                                                    Ta = c[za >> 2] | 0
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
                                                                                    Ta = c[za >> 2] | 0;
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
                                                                Ta = a[(c[za >> 2] | 0) + 54 >> 0] | 0;
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
                                                        c[Ma >> 2] = 0;
                                                        ab = c[za >> 2] | 0;
                                                        if (!((a[ab + 42 >> 0] | 0) == 0 ? (a[ab + 43 >> 0] | 0) == 0 : 0)) o = 122;
                                                        i: do
                                                            if ((o | 0) == 122) {
                                                                o = 0;
                                                                ab = dd(Sa) | 0;
                                                                c[Ma >> 2] = ab;
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
                                                                c[R >> 2] = od(c[Ma >> 2] | 0, 4) | 0;
                                                                c[F >> 2] = od(c[Ma >> 2] | 0, 4) | 0;
                                                                Va = od(c[Ma >> 2] | 0, 4) | 0;
                                                                c[E >> 2] = Va;
                                                                if (!(c[R >> 2] | 0)) {
                                                                    o = 127;
                                                                    break b
                                                                }
                                                                if ((c[F >> 2] | 0) == 0 | (Va | 0) == 0) {
                                                                    o = 127;
                                                                    break b
                                                                }
                                                                if ((c[Ma >> 2] | 0) > 0) {
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
                                                                    } while ((Va | 0) < (c[Ma >> 2] | 0))
                                                                }
                                                                do
                                                                    if ((d[G >> 0] | 0) > 1) {
                                                                        ab = c[za >> 2] | 0;
                                                                        if ((c[ab + 48 >> 2] | 0) <= 1 ? (c[ab + 44 >> 2] | 0) <= 1 : 0) break;
                                                                        c[H >> 2] = 0;
                                                                        a[G >> 0] = 1;
                                                                        break i
                                                                    }
                                                                while (0);
                                                                c[H >> 2] = 0
                                                            }
                                                        while (0);
                                                        Ta = c[za >> 2] | 0;
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
                                                            Ta = c[za >> 2] | 0
                                                        }
                                                        Sa = (c[Ta + 16 >> 2] | 0) + 26 + (c[La >> 2] | 0) | 0;
                                                        a[Ha >> 0] = Sa;
                                                        Sa = Sa << 24;
                                                        if ((Sa | 0) > 855638016) {
                                                            p = B;
                                                            o = 180;
                                                            break a
                                                        }
                                                        if ((Sa >> 24 | 0) < (0 - (c[(c[qa >> 2] | 0) + 13192 >> 2] | 0) | 0)) {
                                                            p = B;
                                                            o = 180;
                                                            break a
                                                        }
                                                        ab = c[Ja >> 2] | 0;
                                                        c[Ka >> 2] = ab;
                                                        if ((ab | 0) == 0 ? (a[Ia >> 0] | 0) != 0 : 0) {
                                                            p = B;
                                                            o = 180;
                                                            break a
                                                        }
                                                        if (((c[Ra + 216 >> 2] | 0) - (c[Ra + 212 >> 2] | 0) | 0) < 0) {
                                                            p = B;
                                                            o = 180;
                                                            break a
                                                        }
                                                        a[(c[u >> 2] | 0) + 203 >> 0] = (a[Ia >> 0] | 0) == 0 & 1;
                                                        if (!(a[(c[za >> 2] | 0) + 22 >> 0] | 0)) a[(c[u >> 2] | 0) + 272 >> 0] = a[Ha >> 0] | 0;
                                                        a[Ga >> 0] = 1;
                                                        a[(c[u >> 2] | 0) + 302 >> 0] = 0;
                                                        a[(c[u >> 2] | 0) + 303 >> 0] = 0;
                                                        Sa = c[Ca >> 2] | 0;
                                                        Ra = c[t >> 2] | 0;
                                                        j: do
                                                            if ((Sa | 0) == 2147483647) switch (Ra | 0) {
                                                                case 18:
                                                                case 16:
                                                                case 17:
                                                                case 21:
                                                                    {
                                                                        Sa = c[pa >> 2] | 0;
                                                                        c[Ca >> 2] = Sa;
                                                                        break j
                                                                    };
                                                                case 20:
                                                                case 19:
                                                                    {
                                                                        c[Ca >> 2] = -2147483648;
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
                                                                if ((c[pa >> 2] | 0) <= (Sa | 0)) {
                                                                    c[ma >> 2] = 0;
                                                                    break c
                                                                }
                                                                if ((Ra | 0) != 9) break;
                                                                c[Ca >> 2] = -2147483648
                                                            }
                                                        while (0);
                                                        k: do
                                                            if (!(a[Aa >> 0] | 0)) {
                                                                if (!(c[r >> 2] | 0)) {
                                                                    Ra = 0;
                                                                    break d
                                                                }
                                                            } else {
                                                                Sa = c[u >> 2] | 0;
                                                                $a = c[qa >> 2] | 0;
                                                                Ra = c[$a + 13064 >> 2] | 0;
                                                                ab = c[$a + 13120 >> 2] >> Ra;
                                                                Ra = (c[$a + 13124 >> 2] >> Ra) + 1 | 0;
                                                                ce(c[ra >> 2] | 0, 0, $(c[sa >> 2] | 0, c[ua >> 2] | 0) | 0) | 0;
                                                                ce(c[va >> 2] | 0, 0, $(c[sa >> 2] | 0, c[ua >> 2] | 0) | 0) | 0;
                                                                $a = c[qa >> 2] | 0;
                                                                ce(c[wa >> 2] | 0, 0, $(c[$a + 13152 >> 2] | 0, c[$a + 13148 >> 2] | 0) | 0) | 0;
                                                                $a = c[qa >> 2] | 0;
                                                                ce(c[xa >> 2] | 0, 0, $((c[$a + 13160 >> 2] | 0) + 1 | 0, (c[$a + 13156 >> 2] | 0) + 1 | 0) | 0) | 0;
                                                                ce(c[ya >> 2] | 0, -1, $((ab << 2) + 4 | 0, Ra) | 0) | 0;
                                                                c[ma >> 2] = 0;
                                                                c[na >> 2] = c[t >> 2];
                                                                Ra = c[za >> 2] | 0;
                                                                if (a[Ra + 42 >> 0] | 0) c[Sa + 312 >> 2] = c[c[Ra + 1648 >> 2] >> 2] << c[(c[qa >> 2] | 0) + 13080 >> 2];
                                                                Ra = _b(m, oa, c[pa >> 2] | 0) | 0;
                                                                do
                                                                    if ((Ra | 0) >= 0) {
                                                                        c[(c[c[r >> 2] >> 2] | 0) + 80 >> 2] = ((c[t >> 2] | 0) + -16 | 0) >>> 0 < 8 & 1;
                                                                        c[(c[oa >> 2] | 0) + 84 >> 2] = 3 - (c[Da >> 2] | 0);
                                                                        yd(c[Ea >> 2] | 0);
                                                                        Ra = $b(m, c[Ea >> 2] | 0, 0) | 0;
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
                                                        if ((c[t >> 2] | 0) != (c[na >> 2] | 0)) {
                                                            p = B;
                                                            o = 180;
                                                            break a
                                                        }
                                                        c[q >> 2] = 0;
                                                        c[aa >> 2] = 1;
                                                        Ra = c[la >> 2] | 0;
                                                        Ba[c[Ra + 816 >> 2] & 1](Ra, 1, q, n, 1, 4) | 0;
                                                        Ra = c[n >> 2] | 0;
                                                        ab = c[qa >> 2] | 0;
                                                        if ((Ra | 0) >= ($(c[ab + 13132 >> 2] | 0, c[ab + 13128 >> 2] | 0) | 0)) c[ma >> 2] = 1;
                                                        if ((Ra | 0) < 0) break d;
                                                        else break c
                                                    };
                                                case 37:
                                                case 36:
                                                    {
                                                        b[Qa >> 1] = (e[Qa >> 1] | 0) + 1 & 255;
                                                        c[Ca >> 2] = 2147483647;
                                                        break c
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
                            c[qa >> 2] = 0;
                            p = B;
                            o = 180;
                            break
                        } else if ((o | 0) == 91) ta();
                        else if ((o | 0) == 127) {
                            c[Ma >> 2] = 0;
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
                o = l >> 1;
                n = o + e | 0;
                q = o + f | 0;
                g = g + -1 | 0;
                h = h + 1 | 0;
                s = Qb(b, e, f, g, h) | 0;
                if ((s | 0) < 0) {
                    X = s;
                    i = j;
                    return X | 0
                }
                if (s) {
                    if ((n | 0) < (c[(c[m >> 2] | 0) + 13120 >> 2] | 0)) {
                        s = Qb(b, n, f, g, h) | 0;
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
                            if ((n | 0) < (c[X + 13120 >> 2] | 0) ? (q | 0) < (c[X + 13124 >> 2] | 0) : 0) {
                                s = Qb(b, n, q, g, h) | 0;
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
                if ((n + o | 0) < (c[k + 13120 >> 2] | 0)) k = 1;
                else k = (q + o | 0) < (c[k + 13124 >> 2] | 0);
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
                    } else if (!z) break;
                    else if ((z | 0) != 2) {
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
                    } else {
                        z = rb(b) | 0;
                        a[C + 31281 >> 0] = z;
                        A = a[C + 31268 >> 0] | 0;
                        if ((z | 0) == 4) z = A & 255;
                        else {
                            z = a[1528 + z >> 0] | 0;
                            z = A << 24 >> 24 == z << 24 >> 24 ? 34 : z & 255
                        }
                        a[C + 31277 >> 0] = a[1536 + z >> 0] | 0;
                        break
                    }
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
                        Ha[c[W >> 2] & 3](D, A, l, l, z, d[(c[m >> 2] | 0) + 13044 >> 0] | 0);
                        X = c[m >> 2] | 0;
                        Ha[c[W >> 2] & 3](B, E, l >> c[X + 13172 >> 2], l >> c[X + 13184 >> 2], z, d[X + 13045 >> 0] | 0);
                        X = c[m >> 2] | 0;
                        Ha[c[W >> 2] & 3](F, C, l >> c[X + 13176 >> 2], l >> c[X + 13188 >> 2], z, d[X + 13045 >> 0] | 0);
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
            M = c[q + 4 >> 2] | 0;
            A = w + 4 | 0;
            c[A >> 2] = M;
            y = c[r >> 2] | 0;
            c[t >> 2] = y;
            J = c[r + 4 >> 2] | 0;
            x = t + 4 | 0;
            c[x >> 2] = J;
            q = a[v + 31254 >> 0] | 0;
            do
                if (q << 24 >> 24) {
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
            G = c[r >> 2] | 0;
            B = (c[G + 13076 >> 2] | 0) >>> 0 < n >>> 0;
            if (((!B ? (c[G + 13072 >> 2] | 0) >>> 0 < n >>> 0 : 0) ? (d[v + 31255 >> 0] | 0) > (o | 0) : 0) ? !(q << 24 >> 24 != 0 & (o | 0) == 0) : 0) q = (sb(e, n) | 0) & 255;
            else {
                if ((c[G + 13088 >> 2] | 0) == 0 ? (c[v + 31244 >> 2] | 0) == 0 : 0) G = (o | 0) == 0 & (c[v + 31248 >> 2] | 0) != 0;
                else G = 0;
                if (B) q = 1;
                else q = (q << 24 >> 24 != 0 & (o | 0) == 0 | G) & 1
            }
            B = (n | 0) > 2;
            G = c[(c[r >> 2] | 0) + 4 >> 2] | 0;
            if (B)
                if (!G) L = y;
                else E = 20;
            else if ((G | 0) == 3) E = 20;
            else L = y;
            do
                if ((E | 0) == 20) {
                    G = (o | 0) == 0;
                    if (!((K | 0) == 0 & (G ^ 1))) {
                        K = tb(e, o) | 0;
                        c[w >> 2] = K;
                        if ((c[(c[r >> 2] | 0) + 4 >> 2] | 0) == 2 ? q << 24 >> 24 == 0 | (n | 0) == 3 : 0) {
                            M = tb(e, o) | 0;
                            c[A >> 2] = M
                        }
                        if (!G) E = 25
                    } else {
                        K = 0;
                        E = 25
                    }
                    if ((E | 0) == 25)
                        if (!y) {
                            L = 0;
                            break
                        }
                    L = tb(e, o) | 0;
                    c[t >> 2] = L;
                    if ((c[(c[r >> 2] | 0) + 4 >> 2] | 0) == 2 ? q << 24 >> 24 == 0 | (n | 0) == 3 : 0) {
                        J = tb(e, o) | 0;
                        c[x >> 2] = J
                    }
                }
            while (0);
            if (!(q << 24 >> 24)) {
                A = c[r >> 2] | 0;
                y = c[A + 13072 >> 2] | 0;
                x = 1 << y;
                q = c[A + 13148 >> 2] | 0;
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
                        if ((p | 0) == 3 ? (F = 1 << n + 1, H = 1 << (c[K + 13184 >> 2] | 0) + n, Cc(e, h, j, F, H), Ub(e, h, j, n, 1), Ub(e, h, j, n, 2), (c[(c[r >> 2] | 0) + 4 >> 2] | 0) == 2) : 0) {
                            M = (1 << n) + j | 0;
                            Cc(e, h, M, F, H);
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
                                J = G + 280 | 0;
                                c[J >> 2] = M;
                                if (M) {
                                    M = (ib(e) | 0) == 1;
                                    H = c[J >> 2] | 0;
                                    if (M) {
                                        H = 0 - H | 0;
                                        c[J >> 2] = H
                                    }
                                } else H = 0;
                                a[D >> 0] = 1;
                                M = (c[(c[r >> 2] | 0) + 13192 >> 2] | 0) / 2 | 0;
                                if ((H | 0) < (-26 - M | 0) | (H | 0) > (M + 25 | 0)) {
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
                                l = c[E >> 2] | 0;
                                if (!(a[l + 1633 >> 0] | 0)) m = 0;
                                else {
                                    m = kb(e) | 0;
                                    l = c[E >> 2] | 0
                                }
                                a[G + 302 >> 0] = a[l + m + 1634 >> 0] | 0;
                                a[G + 303 >> 0] = a[(c[E >> 2] | 0) + m + 1639 >> 0] | 0
                            }
                            a[C >> 0] = 1
                        }
                        if ((c[z >> 2] | 0) == 1 & (n | 0) < 4) {
                            m = c[G + 288 >> 2] | 0;
                            if ((m + -6 | 0) >>> 0 < 9) k = 2;
                            else k = (m + -22 | 0) >>> 0 < 9 & 1;
                            m = c[G + 292 >> 2] | 0;
                            if ((m + -6 | 0) >>> 0 < 9) m = 2;
                            else m = (m + -22 | 0) >>> 0 < 9 & 1
                        } else {
                            k = 0;
                            m = 0
                        }
                        l = G + 304 | 0;
                        a[l >> 0] = 0;
                        if (I) xb(e, f, g, n, k, 0);
                        k = c[r >> 2] | 0;
                        C = c[k + 4 >> 2] | 0;
                        if (C) {
                            if (!(B | (C | 0) == 3)) {
                                if ((p | 0) != 3) break;
                                p = 1 << n + 1;
                                A = 1 << (c[k + 13184 >> 2] | 0) + n;
                                l = 0;
                                do {
                                    if ((c[z >> 2] | 0) == 1) {
                                        M = (l << n) + j | 0;
                                        Cc(e, h, M, p, A);
                                        Ub(e, h, M, n, 1)
                                    }
                                    if (c[w + (l << 2) >> 2] | 0) xb(e, h, (l << n) + j | 0, n, m, 1);
                                    l = l + 1 | 0
                                } while ((l | 0) < (((c[(c[r >> 2] | 0) + 4 >> 2] | 0) == 2 ? 2 : 1) | 0));
                                w = 0;
                                while (1) {
                                    if ((c[z >> 2] | 0) == 1) {
                                        M = (w << n) + j | 0;
                                        Cc(e, h, M, p, A);
                                        Ub(e, h, M, n, 2)
                                    }
                                    if (c[t + (w << 2) >> 2] | 0) xb(e, h, (w << n) + j | 0, n, m, 2);
                                    w = w + 1 | 0;
                                    if ((w | 0) >= (((c[(c[r >> 2] | 0) + 4 >> 2] | 0) == 2 ? 2 : 1) | 0)) break a
                                }
                            }
                            h = 1 << (c[k + 13172 >> 2] | 0) + A;
                            j = 1 << (c[k + 13184 >> 2] | 0) + A;
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
                            p = e + 160 | 0;
                            E = G + 320 | 0;
                            D = G + 11680 | 0;
                            C = 1 << A << A;
                            k = (C | 0) > 0;
                            B = e + (A + -2 << 2) + 2612 | 0;
                            F = G + 284 | 0;
                            I = 0;
                            do {
                                if ((c[z >> 2] | 0) == 1) {
                                    M = (I << A) + g | 0;
                                    Cc(e, f, M, h, j);
                                    Ub(e, f, M, A, 1)
                                }
                                do
                                    if (!(c[w + (I << 2) >> 2] | 0)) {
                                        if (!(a[l >> 0] | 0)) break;
                                        L = c[p >> 2] | 0;
                                        G = c[L + 36 >> 2] | 0;
                                        H = c[r >> 2] | 0;
                                        M = $(g >> c[H + 13184 >> 2], G) | 0;
                                        H = (c[L + 4 >> 2] | 0) + (M + (f >> c[H + 13172 >> 2] << c[H + 56 >> 2])) | 0;
                                        if (k) {
                                            I = 0;
                                            do {
                                                b[D + (I << 1) >> 1] = ($(b[E + (I << 1) >> 1] | 0, c[F >> 2] | 0) | 0) >>> 3;
                                                I = I + 1 | 0
                                            } while ((I | 0) != (C | 0));
                                            I = C
                                        } else I = 0;
                                        Ea[c[B >> 2] & 7](H, D, G)
                                    } else xb(e, f, (I << A) + g | 0, A, m, 1);
                                while (0);
                                I = I + 1 | 0
                            } while ((I | 0) < (((c[(c[r >> 2] | 0) + 4 >> 2] | 0) == 2 ? 2 : 1) | 0));
                            if (!(a[l >> 0] | 0)) H = 0;
                            else {
                                Tb(e, 1);
                                H = 0
                            }
                            do {
                                if ((c[z >> 2] | 0) == 1) {
                                    M = (H << A) + g | 0;
                                    Cc(e, f, M, h, j);
                                    Ub(e, f, M, A, 2)
                                }
                                do
                                    if (!(c[t + (H << 2) >> 2] | 0)) {
                                        if (!(a[l >> 0] | 0)) break;
                                        L = c[p >> 2] | 0;
                                        w = c[L + 40 >> 2] | 0;
                                        G = c[r >> 2] | 0;
                                        M = $(g >> c[G + 13188 >> 2], w) | 0;
                                        G = (c[L + 8 >> 2] | 0) + (M + (f >> c[G + 13176 >> 2] << c[G + 56 >> 2])) | 0;
                                        if (k) {
                                            H = 0;
                                            do {
                                                b[D + (H << 1) >> 1] = ($(b[E + (H << 1) >> 1] | 0, c[F >> 2] | 0) | 0) >>> 3;
                                                H = H + 1 | 0
                                            } while ((H | 0) != (C | 0));
                                            H = C
                                        } else H = 0;
                                        Ea[c[B >> 2] & 7](G, D, w)
                                    } else xb(e, f, (H << A) + g | 0, A, m, 2);
                                while (0);
                                H = H + 1 | 0
                            } while ((H | 0) < (((c[(c[r >> 2] | 0) + 4 >> 2] | 0) == 2 ? 2 : 1) | 0))
                        }
                    }
                while (0);
                if ((o | 0) != 0 ? (u = 1 << n, (u | 0) > 0) : 0) {
                    t = e + 4344 | 0;
                    r = 0;
                    do {
                        w = $(r + g >> y, q) | 0;
                        h = 0;
                        do {
                            a[(c[t >> 2] | 0) + ((h + f >> y) + w) >> 0] = 1;
                            h = h + x | 0
                        } while ((h | 0) < (u | 0));
                        r = r + x | 0
                    } while ((r | 0) < (u | 0))
                }
                if (((a[e + 2061 >> 0] | 0) == 0 ? (Ab(e, f, g, n), (a[(c[e + 204 >> 2] | 0) + 40 >> 0] | 0) != 0) : 0) ? (a[v + 31256 >> 0] | 0) != 0 : 0) Rb(e, f, g, n)
            } else {
                v = n + -1 | 0;
                u = 1 << v;
                n = u + f | 0;
                u = u + g | 0;
                r = o + 1 | 0;
                q = Sb(e, f, g, f, g, k, l, m, v, r, 0, w, t) | 0;
                if ((q | 0) < 0) {
                    M = q;
                    i = s;
                    return M | 0
                }
                q = Sb(e, n, g, f, g, k, l, m, v, r, 1, w, t) | 0;
                if ((q | 0) < 0) {
                    M = q;
                    i = s;
                    return M | 0
                }
                q = Sb(e, f, u, f, g, k, l, m, v, r, 2, w, t) | 0;
                if ((q | 0) < 0) {
                    M = q;
                    i = s;
                    return M | 0
                }
                f = Sb(e, n, u, f, g, k, l, m, v, r, 3, w, t) | 0;
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

        function Ub(b, e, f, g, h) {
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
                ja = 0;
            j = i;
            i = i + 272 | 0;
            t = j + 195 | 0;
            z = j + 130 | 0;
            w = j + 65 | 0;
            v = j;
            r = c[b + 136 >> 2] | 0;
            q = c[b + 200 >> 2] | 0;
            O = c[q + (h << 2) + 13168 >> 2] | 0;
            N = c[q + (h << 2) + 13180 >> 2] | 0;
            k = 1 << g;
            ea = k << O;
            V = c[q + 13072 >> 2] | 0;
            ga = k << N;
            T = c[q + 13164 >> 2] | 0;
            P = e >> V & T;
            R = f >> V & T;
            S = T + 2 | 0;
            Q = ($(R, S) | 0) + P | 0;
            U = c[b + 204 >> 2] | 0;
            aa = c[U + 1684 >> 2] | 0;
            Q = c[aa + (Q << 2) >> 2] | 0;
            l = c[b + 160 >> 2] | 0;
            b = c[l + (h << 2) + 32 >> 2] | 0;
            l = c[l + (h << 2) >> 2] | 0;
            m = ($(b, f >> N) | 0) + (e >> O) | 0;
            n = l + m | 0;
            o = (h | 0) == 0;
            p = c[(o ? r + 288 | 0 : r + 292 | 0) >> 2] | 0;
            u = t + 1 | 0;
            y = w + 1 | 0;
            x = z + 1 | 0;
            s = v + 1 | 0;
            if (!(c[r + 31288 >> 2] | 0)) fa = 0;
            else fa = (Q | 0) > (c[aa + (P + -1 + ($(T & R + (ga >> V), S) | 0) << 2) >> 2] | 0);
            da = fa & 1;
            _ = c[r + 31292 >> 2] | 0;
            H = c[r + 31300 >> 2] | 0;
            Z = c[r + 31296 >> 2] | 0;
            if (!(c[r + 31304 >> 2] | 0)) ba = 0;
            else ba = (Q | 0) > (c[aa + (($(S, R + -1 | 0) | 0) + (T & P + (ea >> V)) << 2) >> 2] | 0);
            S = ba & 1;
            V = (ga << 1) + f | 0;
            R = q + 13124 | 0;
            aa = c[R >> 2] | 0;
            P = ga + f | 0;
            V = ((V | 0) > (aa | 0) ? aa : V) - P >> N;
            aa = (ea << 1) + e | 0;
            T = q + 13120 | 0;
            ja = c[T >> 2] | 0;
            Q = ea + e | 0;
            aa = ((aa | 0) > (ja | 0) ? ja : aa) - Q >> O;
            U = U + 20 | 0;
            if ((a[U >> 0] | 0) == 1) {
                ca = c[q + 13084 >> 2] | 0;
                ha = ga >> ca;
                ea = ea >> ca;
                ia = (1 << ca) + -1 | 0;
                ga = ia & f;
                ea = ((ea | 0) == 0 & 1) + ea | 0;
                ia = (ia & e | 0) != 0;
                if (!(ia | fa ^ 1)) {
                    fa = (c[q + 13160 >> 2] | 0) - (P >> ca) | 0;
                    fa = (ha | 0) > (fa | 0) ? fa : ha;
                    if ((fa | 0) > 0) {
                        da = 0;
                        ja = 0;
                        do {
                            da = da | 1;
                            ja = ja + 2 | 0
                        } while ((ja | 0) < (fa | 0))
                    } else da = 0
                }
                if (!((_ | 0) != 1 | ia)) {
                    fa = (c[q + 13160 >> 2] | 0) - (f >> ca) | 0;
                    fa = (ha | 0) > (fa | 0) ? fa : ha;
                    if ((fa | 0) > 0) {
                        _ = 0;
                        ha = 0;
                        do {
                            _ = _ | 1;
                            ha = ha + 2 | 0
                        } while ((ha | 0) < (fa | 0))
                    } else _ = 0
                }
                fa = (ga | 0) != 0;
                if (!((Z | 0) != 1 | fa)) {
                    ga = (c[q + 13156 >> 2] | 0) - (e >> ca) | 0;
                    ga = (ea | 0) > (ga | 0) ? ga : ea;
                    if ((ga | 0) > 0) {
                        Z = 0;
                        ha = 0;
                        do {
                            Z = Z | 1;
                            ha = ha + 2 | 0
                        } while ((ha | 0) < (ga | 0))
                    } else Z = 0
                }
                if (!(fa | ba ^ 1)) {
                    ca = (c[q + 13156 >> 2] | 0) - (Q >> ca) | 0;
                    ca = (ea | 0) > (ca | 0) ? ca : ea;
                    if ((ca | 0) > 0) {
                        S = 0;
                        ba = 0;
                        do {
                            S = S | 1;
                            ba = ba + 2 | 0
                        } while ((ba | 0) < (ca | 0))
                    } else S = 0
                }
                ba = u + 0 | 0;
                ca = ba + 64 | 0;
                do {
                    a[ba >> 0] = 128;
                    ba = ba + 1 | 0
                } while ((ba | 0) < (ca | 0));
                ba = w + 0 | 0;
                ca = ba + 65 | 0;
                do {
                    a[ba >> 0] = 128;
                    ba = ba + 1 | 0
                } while ((ba | 0) < (ca | 0));
                ea = S
            } else ea = S;
            ba = (H | 0) != 0;
            if (ba) {
                ja = a[l + (m + ~b) >> 0] | 0;
                a[t >> 0] = ja;
                a[w >> 0] = ja
            }
            ca = (Z | 0) != 0;
            if (ca) fe(y | 0, l + (m - b) | 0, k | 0) | 0;
            S = (ea | 0) != 0;
            if (S ? (Y = k + 1 | 0, fe(w + Y | 0, l + (k - b + m) | 0, k | 0) | 0, X = $(d[l + (k + -1 - b + m + aa) >> 0] | 0, 16843009) | 0, W = k - aa | 0, (W | 0) > 0) : 0) {
                Y = aa + Y | 0;
                aa = 0;
                do {
                    ja = w + (Y + aa) | 0;
                    a[ja >> 0] = X;
                    a[ja + 1 >> 0] = X >> 8;
                    a[ja + 2 >> 0] = X >> 16;
                    a[ja + 3 >> 0] = X >> 24;
                    aa = aa + 4 | 0
                } while ((aa | 0) < (W | 0))
            }
            W = (_ | 0) != 0;
            if (W & (k | 0) > 0) {
                Y = m + -1 | 0;
                X = 0;
                do {
                    ja = X;
                    X = X + 1 | 0;
                    a[t + X >> 0] = a[l + (Y + ($(ja, b) | 0)) >> 0] | 0
                } while ((X | 0) != (k | 0))
            }
            X = (da | 0) != 0;
            if (X) {
                aa = V + k | 0;
                fa = m + -1 | 0;
                if ((V | 0) > 0) {
                    Y = k;
                    do {
                        ja = Y;
                        Y = Y + 1 | 0;
                        a[t + Y >> 0] = a[l + (fa + ($(ja, b) | 0)) >> 0] | 0
                    } while ((Y | 0) < (aa | 0))
                }
                Y = $(d[l + (fa + ($(aa + -1 | 0, b) | 0)) >> 0] | 0, 16843009) | 0;
                aa = k - V | 0;
                if ((aa | 0) > 0) {
                    V = k + 1 + V | 0;
                    fa = 0;
                    do {
                        ja = t + (V + fa) | 0;
                        a[ja >> 0] = Y;
                        a[ja + 1 >> 0] = Y >> 8;
                        a[ja + 2 >> 0] = Y >> 16;
                        a[ja + 3 >> 0] = Y >> 24;
                        fa = fa + 4 | 0
                    } while ((fa | 0) < (aa | 0))
                }
            }
            do
                if ((a[U >> 0] | 0) == 1 ? (ja = da | _, L = (ja | 0) == 0, ja = ja | H, M = (ja | 0) == 0, (Z | ea | ja | 0) != 0) : 0) {
                    U = k << 1;
                    V = c[T >> 2] | 0;
                    if (((U << O) + e | 0) < (V | 0)) T = U;
                    else T = V - e >> O;
                    R = c[R >> 2] | 0;
                    if (((U << N) + f | 0) >= (R | 0)) U = R - f >> N;
                    if (!S)
                        if ((Q | 0) < (V | 0)) O = k;
                        else O = V - e >> O;
                    else O = T;
                    if (!X)
                        if ((P | 0) < (R | 0)) U = k;
                        else U = R - f >> N;
                    N = a[w >> 0] | 0;
                    if (M) a[t >> 0] = N;
                    a[t >> 0] = N;
                    if (!L) {
                        L = 0;
                        while (1)
                            if ((L | 0) < (U | 0)) L = L + 4 | 0;
                            else break
                    }
                    if (!W ? (K = $(N & 255, 16843009) | 0, (k | 0) > 0) : 0) {
                        L = 0;
                        do {
                            ja = t + (L | 1) | 0;
                            a[ja >> 0] = K;
                            a[ja + 1 >> 0] = K >> 8;
                            a[ja + 2 >> 0] = K >> 16;
                            a[ja + 3 >> 0] = K >> 24;
                            L = L + 4 | 0
                        } while ((L | 0) < (k | 0))
                    }
                    do
                        if (!X) {
                            L = $(d[t + k >> 0] | 0, 16843009) | 0;
                            if ((k | 0) <= 0) break;
                            K = k + 1 | 0;
                            M = 0;
                            do {
                                ja = t + (K + M) | 0;
                                a[ja >> 0] = L;
                                a[ja + 1 >> 0] = L >> 8;
                                a[ja + 2 >> 0] = L >> 16;
                                a[ja + 3 >> 0] = L >> 24;
                                M = M + 4 | 0
                            } while ((M | 0) < (k | 0))
                        }
                    while (0);
                    f = (f | 0) == 0;
                    if ((e | 0) == 0 & (U | 0) > 0) {
                        e = 0;
                        do {
                            ja = t + (e | 1) | 0;
                            a[ja >> 0] = 0;
                            a[ja + 1 >> 0] = 0;
                            a[ja + 2 >> 0] = 0;
                            a[ja + 3 >> 0] = 0;
                            e = e + 4 | 0
                        } while ((e | 0) < (U | 0))
                    }
                    a[w >> 0] = a[t >> 0] | 0;
                    if (f) break;
                    else e = 0;
                    while (1)
                        if ((e | 0) < (O | 0)) e = e + 4 | 0;
                        else break
                }
            while (0);
            a: do
                if (!X) {
                    if (W) {
                        f = $(d[t + k >> 0] | 0, 16843009) | 0;
                        if ((k | 0) <= 0) {
                            J = 84;
                            break
                        }
                        J = k + 1 | 0;
                        e = 0;
                        while (1) {
                            ja = t + (J + e) | 0;
                            a[ja >> 0] = f;
                            a[ja + 1 >> 0] = f >> 8;
                            a[ja + 2 >> 0] = f >> 16;
                            a[ja + 3 >> 0] = f >> 24;
                            e = e + 4 | 0;
                            if ((e | 0) >= (k | 0)) {
                                J = 84;
                                break a
                            }
                        }
                    }
                    if (ba) {
                        e = $(d[t >> 0] | 0, 16843009) | 0;
                        J = k << 1;
                        if ((k | 0) > 0) I = 0;
                        else {
                            J = 87;
                            break
                        }
                        while (1) {
                            ja = t + (I | 1) | 0;
                            a[ja >> 0] = e;
                            a[ja + 1 >> 0] = e >> 8;
                            a[ja + 2 >> 0] = e >> 16;
                            a[ja + 3 >> 0] = e >> 24;
                            I = I + 4 | 0;
                            if ((I | 0) >= (J | 0)) {
                                J = 87;
                                break a
                            }
                        }
                    }
                    if (ca) {
                        I = a[y >> 0] | 0;
                        a[t >> 0] = I;
                        I = $(I & 255, 16843009) | 0;
                        H = k << 1;
                        if ((k | 0) > 0) J = 0;
                        else {
                            J = 89;
                            break
                        }
                        while (1) {
                            ja = t + (J | 1) | 0;
                            a[ja >> 0] = I;
                            a[ja + 1 >> 0] = I >> 8;
                            a[ja + 2 >> 0] = I >> 16;
                            a[ja + 3 >> 0] = I >> 24;
                            J = J + 4 | 0;
                            if ((J | 0) >= (H | 0)) {
                                J = 89;
                                break a
                            }
                        }
                    }
                    if (!S) {
                        a[t >> 0] = -128;
                        J = k << 1;
                        f = (k | 0) > 0;
                        if (f) e = 0;
                        else {
                            J = 84;
                            break
                        }
                        do {
                            ja = w + (e | 1) | 0;
                            a[ja >> 0] = -2139062144;
                            a[ja + 1 >> 0] = -2139062144 >> 8;
                            a[ja + 2 >> 0] = -2139062144 >> 16;
                            a[ja + 3 >> 0] = -2139062144 >> 24;
                            e = e + 4 | 0
                        } while ((e | 0) < (J | 0));
                        if (f) e = 0;
                        else {
                            J = 84;
                            break
                        }
                        while (1) {
                            ja = t + (e | 1) | 0;
                            a[ja >> 0] = -2139062144;
                            a[ja + 1 >> 0] = -2139062144 >> 8;
                            a[ja + 2 >> 0] = -2139062144 >> 16;
                            a[ja + 3 >> 0] = -2139062144 >> 24;
                            e = e + 4 | 0;
                            if ((e | 0) >= (J | 0)) {
                                J = 84;
                                break a
                            }
                        }
                    }
                    H = w + (k + 1) | 0;
                    e = a[H >> 0] | 0;
                    I = $(e & 255, 16843009) | 0;
                    G = (k | 0) > 0;
                    if (G) J = 0;
                    else {
                        a[t >> 0] = e;
                        break
                    }
                    do {
                        ja = w + (J | 1) | 0;
                        a[ja >> 0] = I;
                        a[ja + 1 >> 0] = I >> 8;
                        a[ja + 2 >> 0] = I >> 16;
                        a[ja + 3 >> 0] = I >> 24;
                        J = J + 4 | 0
                    } while ((J | 0) < (k | 0));
                    I = a[H >> 0] | 0;
                    a[t >> 0] = I;
                    I = $(I & 255, 16843009) | 0;
                    H = k << 1;
                    if (G) {
                        G = 0;
                        do {
                            ja = t + (G | 1) | 0;
                            a[ja >> 0] = I;
                            a[ja + 1 >> 0] = I >> 8;
                            a[ja + 2 >> 0] = I >> 16;
                            a[ja + 3 >> 0] = I >> 24;
                            G = G + 4 | 0
                        } while ((G | 0) < (H | 0));
                        J = 92
                    } else J = 92
                } else J = 84;
            while (0);
            if ((J | 0) == 84)
                if ((_ | 0) == 0 ? (I = $(d[t + (k + 1) >> 0] | 0, 16843009) | 0, (k | 0) > 0) : 0) {
                    J = 0;
                    do {
                        ja = t + (J | 1) | 0;
                        a[ja >> 0] = I;
                        a[ja + 1 >> 0] = I >> 8;
                        a[ja + 2 >> 0] = I >> 16;
                        a[ja + 3 >> 0] = I >> 24;
                        J = J + 4 | 0
                    } while ((J | 0) < (k | 0));
                    J = 87
                } else J = 87;
            if ((J | 0) == 87)
                if (!H) {
                    a[t >> 0] = a[u >> 0] | 0;
                    J = 89
                } else J = 89;
            if ((J | 0) == 89)
                if ((Z | 0) == 0 ? (G = $(d[t >> 0] | 0, 16843009) | 0, (k | 0) > 0) : 0) {
                    H = 0;
                    do {
                        ja = w + (H | 1) | 0;
                        a[ja >> 0] = G;
                        a[ja + 1 >> 0] = G >> 8;
                        a[ja + 2 >> 0] = G >> 16;
                        a[ja + 3 >> 0] = G >> 24;
                        H = H + 4 | 0
                    } while ((H | 0) < (k | 0));
                    J = 92
                } else J = 92;
            if (((J | 0) == 92 ? !S : 0) ? (F = $(d[w + k >> 0] | 0, 16843009) | 0, (k | 0) > 0) : 0) {
                H = k + 1 | 0;
                G = 0;
                do {
                    ja = w + (H + G) | 0;
                    a[ja >> 0] = F;
                    a[ja + 1 >> 0] = F >> 8;
                    a[ja + 2 >> 0] = F >> 16;
                    a[ja + 3 >> 0] = F >> 24;
                    G = G + 4 | 0
                } while ((G | 0) < (k | 0))
            }
            F = a[t >> 0] | 0;
            a[w >> 0] = F;
            b: do
                if (!(c[q + 13112 >> 2] | 0)) {
                    if (o) {
                        if ((p | 0) == 1 | (k | 0) == 4) {
                            s = y;
                            break
                        }
                    } else if (((p | 0) == 1 ? 1 : (c[q + 4 >> 2] | 0) != 3) | (k | 0) == 4) {
                        s = y;
                        break
                    }
                    ja = p + -26 | 0;
                    ja = (ja | 0) > -1 ? ja : 26 - p | 0;
                    ia = p + -10 | 0;
                    ia = (ia | 0) > -1 ? ia : 10 - p | 0;
                    if ((((ja | 0) > (ia | 0) ? ia : ja) | 0) > (c[1576 + (g + -3 << 2) >> 2] | 0)) {
                        if ((o & (a[q + 13061 >> 0] | 0) != 0 & (g | 0) == 5 ? (D = F & 255, E = a[w + 64 >> 0] | 0, C = E & 255, ja = C + D - (d[w + 32 >> 0] << 1) | 0, (((ja | 0) > -1 ? ja : 0 - ja | 0) | 0) < 8) : 0) ? (A = t + 64 | 0, B = a[A >> 0] | 0, ja = (B & 255) + D - (d[t + 32 >> 0] << 1) | 0, (((ja | 0) > -1 ? ja : 0 - ja | 0) | 0) < 8) : 0) {
                            a[v >> 0] = F;
                            a[v + 64 >> 0] = E;
                            w = 0;
                            do {
                                ja = w;
                                w = w + 1 | 0;
                                a[v + w >> 0] = (($(D, 63 - ja | 0) | 0) + 32 + ($(C, w) | 0) | 0) >>> 6
                            } while ((w | 0) != 63);
                            w = 0;
                            while (1) {
                                v = w + 1 | 0;
                                a[t + v >> 0] = (($(F & 255, 63 - w | 0) | 0) + 32 + ($(B & 255, v) | 0) | 0) >>> 6;
                                if ((v | 0) == 63) break b;
                                F = a[t >> 0] | 0;
                                B = a[A >> 0] | 0;
                                w = v
                            }
                        }
                        A = k << 1;
                        D = a[t + A >> 0] | 0;
                        a[z + A >> 0] = D;
                        B = a[w + A >> 0] | 0;
                        a[v + A >> 0] = B;
                        A = A + -2 | 0;
                        C = (A | 0) > -1;
                        if (C) {
                            E = A;
                            while (1) {
                                ja = E + 1 | 0;
                                ia = D;
                                D = a[t + ja >> 0] | 0;
                                a[z + ja >> 0] = ((ia & 255) + 2 + ((D & 255) << 1) + (d[t + E >> 0] | 0) | 0) >>> 2;
                                if ((E | 0) <= 0) break;
                                else E = E + -1 | 0
                            }
                        }
                        ja = ((d[u >> 0] | 0) + 2 + ((F & 255) << 1) + (d[y >> 0] | 0) | 0) >>> 2 & 255;
                        a[z >> 0] = ja;
                        a[v >> 0] = ja;
                        if (C)
                            while (1) {
                                ja = A + 1 | 0;
                                ia = B;
                                B = a[w + ja >> 0] | 0;
                                a[v + ja >> 0] = ((ia & 255) + 2 + ((B & 255) << 1) + (d[w + A >> 0] | 0) | 0) >>> 2;
                                if ((A | 0) <= 0) {
                                    u = x;
                                    break
                                } else A = A + -1 | 0
                            } else u = x
                    } else s = y
                } else s = y;
            while (0);
            if (!p) {
                Vb(n, s, u, b, g);
                i = j;
                return
            } else if ((p | 0) == 1) {
                if ((k | 0) > 0) {
                    p = k;
                    h = 0;
                    do {
                        p = (d[u + h >> 0] | 0) + p + (d[s + h >> 0] | 0) | 0;
                        h = h + 1 | 0
                    } while ((h | 0) != (k | 0));
                    q = p >> g + 1;
                    r = $(q, 16843009) | 0;
                    g = 0;
                    do {
                        p = ($(g, b) | 0) + m | 0;
                        h = 0;
                        do {
                            ja = l + (p + h) | 0;
                            a[ja >> 0] = r;
                            a[ja + 1 >> 0] = r >> 8;
                            a[ja + 2 >> 0] = r >> 16;
                            a[ja + 3 >> 0] = r >> 24;
                            h = h + 4 | 0
                        } while ((h | 0) < (k | 0));
                        g = g + 1 | 0
                    } while ((g | 0) != (k | 0))
                } else q = k >> g + 1;
                if (!(o & (k | 0) < 32)) {
                    i = j;
                    return
                }
                a[n >> 0] = ((q << 1) + 2 + (d[u >> 0] | 0) + (d[s >> 0] | 0) | 0) >>> 2;
                if ((k | 0) <= 1) {
                    i = j;
                    return
                }
                n = (q * 3 | 0) + 2 | 0;
                o = 1;
                do {
                    a[l + (o + m) >> 0] = ((d[s + o >> 0] | 0) + n | 0) >>> 2;
                    o = o + 1 | 0
                } while ((o | 0) != (k | 0));
                o = 1;
                do {
                    a[l + (($(o, b) | 0) + m) >> 0] = ((d[u + o >> 0] | 0) + n | 0) >>> 2;
                    o = o + 1 | 0
                } while ((o | 0) != (k | 0));
                i = j;
                return
            } else {
                if (!(c[q + 13104 >> 2] | 0)) l = 0;
                else l = (a[r + 31256 >> 0] | 0) != 0;
                Wb(n, s, u, b, h, p, k, l & 1);
                i = j;
                return
            }
        }

        function Vb(b, c, e, f, g) {
            b = b | 0;
            c = c | 0;
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
                v = 0;
            m = i;
            j = 1 << g;
            if ((j | 0) <= 0) {
                i = m;
                return
            }
            l = j + -1 | 0;
            h = c + j | 0;
            k = e + j | 0;
            g = g + 1 | 0;
            n = 0;
            do {
                o = e + n | 0;
                p = l - n | 0;
                q = $(n, f) | 0;
                n = n + 1 | 0;
                r = 0;
                do {
                    v = $(d[o >> 0] | 0, l - r | 0) | 0;
                    s = r;
                    r = r + 1 | 0;
                    u = $(d[h >> 0] | 0, r) | 0;
                    t = $(d[c + s >> 0] | 0, p) | 0;
                    a[b + (s + q) >> 0] = v + j + u + t + ($(d[k >> 0] | 0, n) | 0) >> g
                } while ((r | 0) != (j | 0))
            } while ((n | 0) != (j | 0));
            i = m;
            return
        }

        function Wb(c, e, f, g, h, j, k, l) {
            c = c | 0;
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
                t = 0,
                u = 0,
                v = 0,
                w = 0,
                x = 0,
                y = 0;
            m = i;
            i = i + 112 | 0;
            o = m;
            n = a[1592 + (j + -2) >> 0] | 0;
            p = o + k | 0;
            q = ($(n, k) | 0) >> 5;
            if ((j | 0) > 17) {
                s = e + -1 | 0;
                r = j + -11 | 0;
                if (r >>> 0 < 15 & (q | 0) < -1) {
                    if ((k | 0) >= 0) {
                        s = 0;
                        do {
                            u = e + (s + -1) | 0;
                            u = d[u >> 0] | d[u + 1 >> 0] << 8 | d[u + 2 >> 0] << 16 | d[u + 3 >> 0] << 24;
                            v = o + (s + k) | 0;
                            a[v >> 0] = u;
                            a[v + 1 >> 0] = u >> 8;
                            a[v + 2 >> 0] = u >> 16;
                            a[v + 3 >> 0] = u >> 24;
                            s = s + 4 | 0
                        } while ((s | 0) <= (k | 0))
                    }
                    if ((q | 0) < 0) {
                        r = b[1632 + (r << 1) >> 1] | 0;
                        do {
                            a[o + (q + k) >> 0] = a[f + ((($(r, q) | 0) + 128 >> 8) + -1) >> 0] | 0;
                            q = q + 1 | 0
                        } while ((q | 0) != 0)
                    }
                } else p = s;
                o = (k | 0) > 0;
                if (o) {
                    q = 0;
                    do {
                        u = q;
                        q = q + 1 | 0;
                        s = $(q, n) | 0;
                        r = s >> 5;
                        s = s & 31;
                        if (!s) {
                            r = r + 1 | 0;
                            s = $(u, g) | 0;
                            t = 0;
                            do {
                                u = p + (r + t) | 0;
                                u = d[u >> 0] | d[u + 1 >> 0] << 8 | d[u + 2 >> 0] << 16 | d[u + 3 >> 0] << 24;
                                v = c + (t + s) | 0;
                                a[v >> 0] = u;
                                a[v + 1 >> 0] = u >> 8;
                                a[v + 2 >> 0] = u >> 16;
                                a[v + 3 >> 0] = u >> 24;
                                t = t + 4 | 0
                            } while ((t | 0) < (k | 0))
                        } else {
                            t = 32 - s | 0;
                            v = $(u, g) | 0;
                            u = 0;
                            do {
                                w = u + r | 0;
                                x = $(d[p + (w + 1) >> 0] | 0, t) | 0;
                                a[c + (u + v) >> 0] = (x + 16 + ($(d[p + (w + 2) >> 0] | 0, s) | 0) | 0) >>> 5;
                                w = u | 1;
                                x = w + r | 0;
                                y = $(d[p + (x + 1) >> 0] | 0, t) | 0;
                                a[c + (w + v) >> 0] = (y + 16 + ($(d[p + (x + 2) >> 0] | 0, s) | 0) | 0) >>> 5;
                                w = u | 2;
                                x = w + r | 0;
                                y = $(d[p + (x + 1) >> 0] | 0, t) | 0;
                                a[c + (w + v) >> 0] = (y + 16 + ($(d[p + (x + 2) >> 0] | 0, s) | 0) | 0) >>> 5;
                                w = u | 3;
                                x = w + r | 0;
                                y = $(d[p + (x + 1) >> 0] | 0, t) | 0;
                                a[c + (w + v) >> 0] = (y + 16 + ($(d[p + (x + 2) >> 0] | 0, s) | 0) | 0) >>> 5;
                                u = u + 4 | 0
                            } while ((u | 0) < (k | 0))
                        }
                    } while ((q | 0) != (k | 0))
                }
                if (!((j | 0) == 26 & (h | 0) == 0 & (k | 0) < 32 & (l | 0) == 0 & o)) {
                    i = m;
                    return
                }
                j = f + -1 | 0;
                n = 0;
                do {
                    h = ((d[f + n >> 0] | 0) - (d[j >> 0] | 0) >> 1) + (d[e >> 0] | 0) | 0;
                    if (h >>> 0 > 255) h = 0 - h >> 31;
                    a[c + ($(n, g) | 0) >> 0] = h;
                    n = n + 1 | 0
                } while ((n | 0) != (k | 0));
                i = m;
                return
            }
            s = f + -1 | 0;
            r = j + -11 | 0;
            if (r >>> 0 < 15 & (q | 0) < -1) {
                if ((k | 0) >= 0) {
                    s = 0;
                    do {
                        x = f + (s + -1) | 0;
                        x = d[x >> 0] | d[x + 1 >> 0] << 8 | d[x + 2 >> 0] << 16 | d[x + 3 >> 0] << 24;
                        y = o + (s + k) | 0;
                        a[y >> 0] = x;
                        a[y + 1 >> 0] = x >> 8;
                        a[y + 2 >> 0] = x >> 16;
                        a[y + 3 >> 0] = x >> 24;
                        s = s + 4 | 0
                    } while ((s | 0) <= (k | 0))
                }
                if ((q | 0) < 0) {
                    r = b[1632 + (r << 1) >> 1] | 0;
                    do {
                        a[o + (q + k) >> 0] = a[e + ((($(r, q) | 0) + 128 >> 8) + -1) >> 0] | 0;
                        q = q + 1 | 0
                    } while ((q | 0) != 0)
                }
            } else p = s;
            q = (k | 0) > 0;
            if (q) {
                o = 0;
                do {
                    r = o;
                    o = o + 1 | 0;
                    t = $(o, n) | 0;
                    u = t >> 5;
                    t = t & 31;
                    if (!t) {
                        s = u + 1 | 0;
                        t = 0;
                        do {
                            a[c + (($(t, g) | 0) + r) >> 0] = a[p + (s + t) >> 0] | 0;
                            t = t + 1 | 0
                        } while ((t | 0) != (k | 0))
                    } else {
                        s = 32 - t | 0;
                        v = 0;
                        do {
                            y = v + u | 0;
                            x = $(d[p + (y + 1) >> 0] | 0, s) | 0;
                            a[c + (($(v, g) | 0) + r) >> 0] = (x + 16 + ($(d[p + (y + 2) >> 0] | 0, t) | 0) | 0) >>> 5;
                            v = v + 1 | 0
                        } while ((v | 0) != (k | 0))
                    }
                } while ((o | 0) != (k | 0))
            }
            if (!((j | 0) == 10 & (h | 0) == 0 & (k | 0) < 32 & (l | 0) == 0 & q)) {
                i = m;
                return
            }
            g = e + -1 | 0;
            n = 0;
            do {
                j = ((d[e + n >> 0] | 0) - (d[g >> 0] | 0) >> 1) + (d[f >> 0] | 0) | 0;
                if (j >>> 0 > 255) j = 0 - j >> 31;
                a[c + n >> 0] = j;
                j = n | 1;
                h = ((d[e + j >> 0] | 0) - (d[g >> 0] | 0) >> 1) + (d[f >> 0] | 0) | 0;
                if (h >>> 0 > 255) h = 0 - h >> 31;
                a[c + j >> 0] = h;
                j = n | 2;
                h = ((d[e + j >> 0] | 0) - (d[g >> 0] | 0) >> 1) + (d[f >> 0] | 0) | 0;
                if (h >>> 0 > 255) h = 0 - h >> 31;
                a[c + j >> 0] = h;
                j = n | 3;
                h = ((d[e + j >> 0] | 0) - (d[g >> 0] | 0) >> 1) + (d[f >> 0] | 0) | 0;
                if (h >>> 0 > 255) h = 0 - h >> 31;
                a[c + j >> 0] = h;
                n = n + 4 | 0
            } while ((n | 0) < (k | 0));
            i = m;
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
            c[a >> 2] = 1;
            c[a + 4 >> 2] = 1;
            c[a + 8 >> 2] = 2;
            c[a + 12 >> 2] = 3;
            c[a + 16 >> 2] = 4;
            c[a + 20 >> 2] = 1;
            c[a + 24 >> 2] = 5;
            c[a + 28 >> 2] = 2;
            c[a + 32 >> 2] = 2;
            c[a + 36 >> 2] = 3;
            c[a + 40 >> 2] = 4;
            c[a + 44 >> 2] = 5;
            c[a + 48 >> 2] = 3;
            c[a + 52 >> 2] = 4;
            c[a + 56 >> 2] = 5;
            c[a + 60 >> 2] = 6;
            c[a + 64 >> 2] = 1;
            c[a + 68 >> 2] = 1;
            c[a + 72 >> 2] = 2;
            c[a + 1676 >> 2] = 2;
            c[a + 1680 >> 2] = 3;
            c[a + 1684 >> 2] = 1;
            c[a + 1688 >> 2] = 2;
            c[a + 1692 >> 2] = 2;
            c[a + 1696 >> 2] = 3;
            c[a + 1700 >> 2] = 1;
            c[a + 1704 >> 2] = 2;
            return
        }

        function cc(b, c, d, e, f, g) {
            b = b | 0;
            c = c | 0;
            d = d | 0;
            e = e | 0;
            f = f | 0;
            g = g | 0;
            var h = 0,
                j = 0,
                k = 0,
                l = 0,
                m = 0;
            h = i;
            if ((e | 0) <= 0) {
                i = h;
                return
            }
            k = (d | 0) > 0;
            j = 8 - g | 0;
            m = 0;
            while (1) {
                if (k) {
                    l = 0;
                    do {
                        a[b + l >> 0] = (_c(f, g) | 0) << j;
                        l = l + 1 | 0
                    } while ((l | 0) != (d | 0))
                }
                m = m + 1 | 0;
                if ((m | 0) == (e | 0)) break;
                else b = b + c | 0
            }
            i = h;
            return
        }

        function dc(c, e, f) {
            c = c | 0;
            e = e | 0;
            f = f | 0;
            var g = 0,
                h = 0,
                j = 0,
                k = 0,
                l = 0,
                m = 0;
            g = i;
            h = 0;
            while (1) {
                j = e;
                k = 0;
                while (1) {
                    l = c + k | 0;
                    m = (b[j >> 1] | 0) + (d[l >> 0] | 0) | 0;
                    if (m >>> 0 > 255) m = 0 - m >> 31;
                    a[l >> 0] = m;
                    k = k + 1 | 0;
                    if ((k | 0) == 4) break;
                    else j = j + 2 | 0
                }
                h = h + 1 | 0;
                if ((h | 0) == 4) break;
                else {
                    e = e + 8 | 0;
                    c = c + f | 0
                }
            }
            i = g;
            return
        }

        function ec(c, e, f) {
            c = c | 0;
            e = e | 0;
            f = f | 0;
            var g = 0,
                h = 0,
                j = 0,
                k = 0,
                l = 0,
                m = 0;
            g = i;
            h = 0;
            while (1) {
                j = e;
                k = 0;
                while (1) {
                    l = c + k | 0;
                    m = (b[j >> 1] | 0) + (d[l >> 0] | 0) | 0;
                    if (m >>> 0 > 255) m = 0 - m >> 31;
                    a[l >> 0] = m;
                    k = k + 1 | 0;
                    if ((k | 0) == 8) break;
                    else j = j + 2 | 0
                }
                h = h + 1 | 0;
                if ((h | 0) == 8) break;
                else {
                    e = e + 16 | 0;
                    c = c + f | 0
                }
            }
            i = g;
            return
        }

        function fc(c, e, f) {
            c = c | 0;
            e = e | 0;
            f = f | 0;
            var g = 0,
                h = 0,
                j = 0,
                k = 0,
                l = 0,
                m = 0;
            g = i;
            h = 0;
            while (1) {
                j = e;
                k = 0;
                while (1) {
                    l = c + k | 0;
                    m = (b[j >> 1] | 0) + (d[l >> 0] | 0) | 0;
                    if (m >>> 0 > 255) m = 0 - m >> 31;
                    a[l >> 0] = m;
                    k = k + 1 | 0;
                    if ((k | 0) == 16) break;
                    else j = j + 2 | 0
                }
                h = h + 1 | 0;
                if ((h | 0) == 16) break;
                else {
                    e = e + 32 | 0;
                    c = c + f | 0
                }
            }
            i = g;
            return
        }

        function gc(c, e, f) {
            c = c | 0;
            e = e | 0;
            f = f | 0;
            var g = 0,
                h = 0,
                j = 0,
                k = 0,
                l = 0,
                m = 0;
            g = i;
            h = 0;
            while (1) {
                j = e;
                k = 0;
                while (1) {
                    l = c + k | 0;
                    m = (b[j >> 1] | 0) + (d[l >> 0] | 0) | 0;
                    if (m >>> 0 > 255) m = 0 - m >> 31;
                    a[l >> 0] = m;
                    k = k + 1 | 0;
                    if ((k | 0) == 32) break;
                    else j = j + 2 | 0
                }
                h = h + 1 | 0;
                if ((h | 0) == 32) break;
                else {
                    e = e + 64 | 0;
                    c = c + f | 0
                }
            }
            i = g;
            return
        }

        function hc(a, c) {
            a = a | 0;
            c = c | 0;
            var d = 0,
                e = 0,
                f = 0,
                g = 0,
                h = 0,
                j = 0;
            d = i;
            c = c << 16 >> 16;
            e = 7 - c | 0;
            c = 1 << c;
            if ((e | 0) > 0) {
                f = 1 << e + -1;
                if ((c | 0) > 0) g = 0;
                else {
                    i = d;
                    return
                }
                while (1) {
                    h = a;
                    j = 0;
                    while (1) {
                        b[h >> 1] = (b[h >> 1] | 0) + f >> e;
                        j = j + 1 | 0;
                        if ((j | 0) == (c | 0)) break;
                        else h = h + 2 | 0
                    }
                    g = g + 1 | 0;
                    if ((g | 0) == (c | 0)) break;
                    else a = a + (c << 1) | 0
                }
                i = d;
                return
            }
            if ((c | 0) <= 0) {
                i = d;
                return
            }
            e = 0 - e | 0;
            f = 0;
            while (1) {
                g = a;
                h = 0;
                while (1) {
                    b[g >> 1] = b[g >> 1] << e;
                    h = h + 1 | 0;
                    if ((h | 0) == (c | 0)) break;
                    else g = g + 2 | 0
                }
                f = f + 1 | 0;
                if ((f | 0) == (c | 0)) break;
                else a = a + (c << 1) | 0
            }
            i = d;
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

        function jc(a) {
            a = a | 0;
            var c = 0,
                d = 0,
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
                p = 0;
            c = i;
            e = 0;
            d = a;
            while (1) {
                p = b[d >> 1] | 0;
                m = d + 16 | 0;
                n = b[m >> 1] | 0;
                g = n + p | 0;
                f = d + 24 | 0;
                o = b[f >> 1] | 0;
                l = o + n | 0;
                j = p - o | 0;
                h = d + 8 | 0;
                k = (b[h >> 1] | 0) * 74 | 0;
                o = ((p - n + o | 0) * 74 | 0) + 64 | 0;
                n = o >> 7;
                if ((n + 32768 | 0) >>> 0 > 65535) n = o >> 31 ^ 32767;
                b[m >> 1] = n;
                m = (g * 29 | 0) + 64 + (l * 55 | 0) + k | 0;
                n = m >> 7;
                if ((n + 32768 | 0) >>> 0 > 65535) n = m >> 31 ^ 32767;
                b[d >> 1] = n;
                l = ($(l, -29) | 0) + 64 + (j * 55 | 0) + k | 0;
                m = l >> 7;
                if ((m + 32768 | 0) >>> 0 > 65535) m = l >> 31 ^ 32767;
                b[h >> 1] = m;
                g = (g * 55 | 0) + 64 + (j * 29 | 0) - k | 0;
                h = g >> 7;
                if ((h + 32768 | 0) >>> 0 > 65535) h = g >> 31 ^ 32767;
                b[f >> 1] = h;
                e = e + 1 | 0;
                if ((e | 0) == 4) {
                    d = 0;
                    break
                } else d = d + 2 | 0
            }
            while (1) {
                p = b[a >> 1] | 0;
                l = a + 4 | 0;
                m = b[l >> 1] | 0;
                g = m + p | 0;
                e = a + 6 | 0;
                n = b[e >> 1] | 0;
                k = n + m | 0;
                h = p - n | 0;
                f = a + 2 | 0;
                j = (b[f >> 1] | 0) * 74 | 0;
                n = ((p - m + n | 0) * 74 | 0) + 2048 | 0;
                m = n >> 12;
                if ((m + 32768 | 0) >>> 0 > 65535) m = n >> 31 ^ 32767;
                b[l >> 1] = m;
                l = (g * 29 | 0) + 2048 + (k * 55 | 0) + j | 0;
                m = l >> 12;
                if ((m + 32768 | 0) >>> 0 > 65535) m = l >> 31 ^ 32767;
                b[a >> 1] = m;
                k = ($(k, -29) | 0) + 2048 + (h * 55 | 0) + j | 0;
                l = k >> 12;
                if ((l + 32768 | 0) >>> 0 > 65535) l = k >> 31 ^ 32767;
                b[f >> 1] = l;
                f = (g * 55 | 0) + 2048 + (h * 29 | 0) - j | 0;
                g = f >> 12;
                if ((g + 32768 | 0) >>> 0 > 65535) g = f >> 31 ^ 32767;
                b[e >> 1] = g;
                d = d + 1 | 0;
                if ((d | 0) == 4) break;
                else a = a + 8 | 0
            }
            i = c;
            return
        }

        function kc(a, c) {
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
                o = 0;
            c = i;
            f = 0;
            e = a;
            while (1) {
                l = b[e >> 1] << 6;
                j = e + 16 | 0;
                k = b[j >> 1] << 6;
                g = k + l | 0;
                k = l - k | 0;
                l = e + 8 | 0;
                m = b[l >> 1] | 0;
                d = e + 24 | 0;
                n = b[d >> 1] | 0;
                h = (n * 36 | 0) + (m * 83 | 0) | 0;
                m = ($(n, -83) | 0) + (m * 36 | 0) | 0;
                n = g + 64 + h | 0;
                o = n >> 7;
                if ((o + 32768 | 0) >>> 0 > 65535) o = n >> 31 ^ 32767;
                b[e >> 1] = o;
                o = k + 64 + m | 0;
                n = o >> 7;
                if ((n + 32768 | 0) >>> 0 > 65535) n = o >> 31 ^ 32767;
                b[l >> 1] = n;
                l = k - m + 64 | 0;
                k = l >> 7;
                if ((k + 32768 | 0) >>> 0 > 65535) k = l >> 31 ^ 32767;
                b[j >> 1] = k;
                h = g - h + 64 | 0;
                g = h >> 7;
                if ((g + 32768 | 0) >>> 0 > 65535) g = h >> 31 ^ 32767;
                b[d >> 1] = g;
                f = f + 1 | 0;
                if ((f | 0) == 4) {
                    e = 0;
                    break
                } else e = e + 2 | 0
            }
            while (1) {
                k = b[a >> 1] << 6;
                h = a + 4 | 0;
                l = b[h >> 1] << 6;
                g = l + k | 0;
                l = k - l | 0;
                k = a + 2 | 0;
                j = b[k >> 1] | 0;
                d = a + 6 | 0;
                m = b[d >> 1] | 0;
                f = (m * 36 | 0) + (j * 83 | 0) | 0;
                j = ($(m, -83) | 0) + (j * 36 | 0) | 0;
                m = g + 2048 + f | 0;
                n = m >> 12;
                if ((n + 32768 | 0) >>> 0 > 65535) n = m >> 31 ^ 32767;
                b[a >> 1] = n;
                m = l + 2048 + j | 0;
                n = m >> 12;
                if ((n + 32768 | 0) >>> 0 > 65535) n = m >> 31 ^ 32767;
                b[k >> 1] = n;
                k = l - j + 2048 | 0;
                j = k >> 12;
                if ((j + 32768 | 0) >>> 0 > 65535) j = k >> 31 ^ 32767;
                b[h >> 1] = j;
                f = g - f + 2048 | 0;
                g = f >> 12;
                if ((g + 32768 | 0) >>> 0 > 65535) g = f >> 31 ^ 32767;
                b[d >> 1] = g;
                e = e + 1 | 0;
                if ((e | 0) == 4) break;
                else a = a + 8 | 0
            }
            i = c;
            return
        }

        function lc(d, e) {
            d = d | 0;
            e = e | 0;
            var f = 0,
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
            h = i;
            i = i + 64 | 0;
            j = h + 48 | 0;
            p = h + 32 | 0;
            f = h + 16 | 0;
            g = h;
            q = (e | 0) > 8;
            r = e + 4 | 0;
            k = j + 4 | 0;
            l = j + 8 | 0;
            m = j + 12 | 0;
            o = 0;
            r = (r | 0) > 8 ? 8 : r;
            n = d;
            while (1) {
                c[p + 0 >> 2] = 0;
                c[p + 4 >> 2] = 0;
                c[p + 8 >> 2] = 0;
                c[p + 12 >> 2] = 0;
                w = (r | 0) > 1;
                s = 0;
                do {
                    if (w) {
                        t = p + (s << 2) | 0;
                        v = c[t >> 2] | 0;
                        u = 1;
                        do {
                            v = ($(b[n + (u << 3 << 1) >> 1] | 0, a[1664 + (u << 2 << 5) + s >> 0] | 0) | 0) + v | 0;
                            u = u + 2 | 0
                        } while ((u | 0) < (r | 0));
                        c[t >> 2] = v
                    }
                    s = s + 1 | 0
                } while ((s | 0) != 4);
                v = b[n >> 1] << 6;
                u = b[n + 64 >> 1] << 6;
                w = u + v | 0;
                u = v - u | 0;
                v = b[n + 32 >> 1] | 0;
                t = b[n + 96 >> 1] | 0;
                s = (t * 36 | 0) + (v * 83 | 0) | 0;
                v = ($(t, -83) | 0) + (v * 36 | 0) | 0;
                t = s + w | 0;
                c[j >> 2] = t;
                c[k >> 2] = v + u;
                c[l >> 2] = u - v;
                c[m >> 2] = w - s;
                s = 0;
                while (1) {
                    u = c[p + (s << 2) >> 2] | 0;
                    v = t + 64 + u | 0;
                    w = v >> 7;
                    if ((w + 32768 | 0) >>> 0 > 65535) w = v >> 31 ^ 32767;
                    b[n + (s << 3 << 1) >> 1] = w;
                    t = t - u + 64 | 0;
                    u = t >> 7;
                    if ((u + 32768 | 0) >>> 0 > 65535) u = t >> 31 ^ 32767;
                    b[n + (7 - s << 3 << 1) >> 1] = u;
                    s = s + 1 | 0;
                    if ((s | 0) == 4) break;
                    t = c[j + (s << 2) >> 2] | 0
                }
                if ((r | 0) < 8) r = (o & 3 | 0) == 0 & (o | 0) != 0 ? r + -4 | 0 : r;
                o = o + 1 | 0;
                if ((o | 0) == 8) break;
                else n = n + 2 | 0
            }
            j = q ? 8 : e;
            n = (j | 0) > 1;
            k = f + 4 | 0;
            l = f + 8 | 0;
            m = f + 12 | 0;
            o = 0;
            while (1) {
                c[g + 0 >> 2] = 0;
                c[g + 4 >> 2] = 0;
                c[g + 8 >> 2] = 0;
                c[g + 12 >> 2] = 0;
                e = 0;
                do {
                    if (n) {
                        r = g + (e << 2) | 0;
                        p = c[r >> 2] | 0;
                        q = 1;
                        do {
                            p = ($(b[d + (q << 1) >> 1] | 0, a[1664 + (q << 2 << 5) + e >> 0] | 0) | 0) + p | 0;
                            q = q + 2 | 0
                        } while ((q | 0) < (j | 0));
                        c[r >> 2] = p
                    }
                    e = e + 1 | 0
                } while ((e | 0) != 4);
                v = b[d >> 1] << 6;
                u = b[d + 8 >> 1] << 6;
                w = u + v | 0;
                u = v - u | 0;
                v = b[d + 4 >> 1] | 0;
                p = b[d + 12 >> 1] | 0;
                e = (p * 36 | 0) + (v * 83 | 0) | 0;
                v = ($(p, -83) | 0) + (v * 36 | 0) | 0;
                p = e + w | 0;
                c[f >> 2] = p;
                c[k >> 2] = v + u;
                c[l >> 2] = u - v;
                c[m >> 2] = w - e;
                e = 0;
                while (1) {
                    q = c[g + (e << 2) >> 2] | 0;
                    r = p + 2048 + q | 0;
                    s = r >> 12;
                    if ((s + 32768 | 0) >>> 0 > 65535) s = r >> 31 ^ 32767;
                    b[d + (e << 1) >> 1] = s;
                    p = p - q + 2048 | 0;
                    q = p >> 12;
                    if ((q + 32768 | 0) >>> 0 > 65535) q = p >> 31 ^ 32767;
                    b[d + (7 - e << 1) >> 1] = q;
                    e = e + 1 | 0;
                    if ((e | 0) == 4) break;
                    p = c[f + (e << 2) >> 2] | 0
                }
                o = o + 1 | 0;
                if ((o | 0) == 8) break;
                else d = d + 16 | 0
            }
            i = h;
            return
        }

        function mc(d, e) {
            d = d | 0;
            e = e | 0;
            var f = 0,
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
                A = 0;
            j = i;
            i = i + 192 | 0;
            t = j + 160 | 0;
            u = j + 128 | 0;
            m = j + 112 | 0;
            l = j + 96 | 0;
            g = j + 64 | 0;
            h = j + 32 | 0;
            f = j + 16 | 0;
            k = j;
            s = (e | 0) > 16;
            v = e + 4 | 0;
            n = m + 4 | 0;
            o = m + 8 | 0;
            p = m + 12 | 0;
            r = 0;
            v = (v | 0) > 16 ? 16 : v;
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
                A = (v | 0) > 1;
                z = 0;
                do {
                    if (A) {
                        y = u + (z << 2) | 0;
                        w = c[y >> 2] | 0;
                        x = 1;
                        do {
                            w = ($(b[q + (x << 4 << 1) >> 1] | 0, a[1664 + (x << 1 << 5) + z >> 0] | 0) | 0) + w | 0;
                            x = x + 2 | 0
                        } while ((x | 0) < (v | 0));
                        c[y >> 2] = w
                    }
                    z = z + 1 | 0
                } while ((z | 0) != 8);
                c[l + 0 >> 2] = 0;
                c[l + 4 >> 2] = 0;
                c[l + 8 >> 2] = 0;
                c[l + 12 >> 2] = 0;
                z = 0;
                do {
                    x = l + (z << 2) | 0;
                    w = c[x >> 2] | 0;
                    y = 1;
                    do {
                        w = ($(b[q + (y << 5 << 1) >> 1] | 0, a[1664 + (y << 2 << 5) + z >> 0] | 0) | 0) + w | 0;
                        y = y + 2 | 0
                    } while ((y | 0) < 8);
                    c[x >> 2] = w;
                    z = z + 1 | 0
                } while ((z | 0) != 4);
                z = b[q >> 1] << 6;
                y = b[q + 256 >> 1] << 6;
                A = y + z | 0;
                y = z - y | 0;
                z = b[q + 128 >> 1] | 0;
                w = b[q + 384 >> 1] | 0;
                x = (w * 36 | 0) + (z * 83 | 0) | 0;
                z = ($(w, -83) | 0) + (z * 36 | 0) | 0;
                w = x + A | 0;
                c[m >> 2] = w;
                c[n >> 2] = z + y;
                c[o >> 2] = y - z;
                c[p >> 2] = A - x;
                x = 0;
                while (1) {
                    A = c[l + (x << 2) >> 2] | 0;
                    c[t + (x << 2) >> 2] = A + w;
                    c[t + (7 - x << 2) >> 2] = w - A;
                    x = x + 1 | 0;
                    if ((x | 0) == 4) {
                        w = 0;
                        break
                    }
                    w = c[m + (x << 2) >> 2] | 0
                }
                do {
                    x = c[t + (w << 2) >> 2] | 0;
                    y = c[u + (w << 2) >> 2] | 0;
                    A = x + 64 + y | 0;
                    z = A >> 7;
                    if ((z + 32768 | 0) >>> 0 > 65535) z = A >> 31 ^ 32767;
                    b[q + (w << 4 << 1) >> 1] = z;
                    x = x - y + 64 | 0;
                    y = x >> 7;
                    if ((y + 32768 | 0) >>> 0 > 65535) y = x >> 31 ^ 32767;
                    b[q + (15 - w << 4 << 1) >> 1] = y;
                    w = w + 1 | 0
                } while ((w | 0) != 8);
                if ((v | 0) < 16) v = (r & 3 | 0) == 0 & (r | 0) != 0 ? v + -4 | 0 : v;
                r = r + 1 | 0;
                if ((r | 0) == 16) break;
                else q = q + 2 | 0
            }
            o = s ? 16 : e;
            p = (o | 0) > 1;
            l = f + 4 | 0;
            m = f + 8 | 0;
            n = f + 12 | 0;
            q = 0;
            while (1) {
                c[h + 0 >> 2] = 0;
                c[h + 4 >> 2] = 0;
                c[h + 8 >> 2] = 0;
                c[h + 12 >> 2] = 0;
                c[h + 16 >> 2] = 0;
                c[h + 20 >> 2] = 0;
                c[h + 24 >> 2] = 0;
                c[h + 28 >> 2] = 0;
                r = 0;
                do {
                    if (p) {
                        e = h + (r << 2) | 0;
                        t = c[e >> 2] | 0;
                        s = 1;
                        do {
                            t = ($(b[d + (s << 1) >> 1] | 0, a[1664 + (s << 1 << 5) + r >> 0] | 0) | 0) + t | 0;
                            s = s + 2 | 0
                        } while ((s | 0) < (o | 0));
                        c[e >> 2] = t
                    }
                    r = r + 1 | 0
                } while ((r | 0) != 8);
                c[k + 0 >> 2] = 0;
                c[k + 4 >> 2] = 0;
                c[k + 8 >> 2] = 0;
                c[k + 12 >> 2] = 0;
                t = 0;
                do {
                    r = k + (t << 2) | 0;
                    s = c[r >> 2] | 0;
                    e = 1;
                    do {
                        s = ($(b[d + (e << 1 << 1) >> 1] | 0, a[1664 + (e << 2 << 5) + t >> 0] | 0) | 0) + s | 0;
                        e = e + 2 | 0
                    } while ((e | 0) < 8);
                    c[r >> 2] = s;
                    t = t + 1 | 0
                } while ((t | 0) != 4);
                z = b[d >> 1] << 6;
                y = b[d + 16 >> 1] << 6;
                A = y + z | 0;
                y = z - y | 0;
                z = b[d + 8 >> 1] | 0;
                r = b[d + 24 >> 1] | 0;
                e = (r * 36 | 0) + (z * 83 | 0) | 0;
                z = ($(r, -83) | 0) + (z * 36 | 0) | 0;
                r = e + A | 0;
                c[f >> 2] = r;
                c[l >> 2] = z + y;
                c[m >> 2] = y - z;
                c[n >> 2] = A - e;
                e = 0;
                while (1) {
                    A = c[k + (e << 2) >> 2] | 0;
                    c[g + (e << 2) >> 2] = A + r;
                    c[g + (7 - e << 2) >> 2] = r - A;
                    e = e + 1 | 0;
                    if ((e | 0) == 4) {
                        r = 0;
                        break
                    }
                    r = c[f + (e << 2) >> 2] | 0
                }
                do {
                    e = c[g + (r << 2) >> 2] | 0;
                    s = c[h + (r << 2) >> 2] | 0;
                    u = e + 2048 + s | 0;
                    t = u >> 12;
                    if ((t + 32768 | 0) >>> 0 > 65535) t = u >> 31 ^ 32767;
                    b[d + (r << 1) >> 1] = t;
                    e = e - s + 2048 | 0;
                    s = e >> 12;
                    if ((s + 32768 | 0) >>> 0 > 65535) s = e >> 31 ^ 32767;
                    b[d + (15 - r << 1) >> 1] = s;
                    r = r + 1 | 0
                } while ((r | 0) != 8);
                q = q + 1 | 0;
                if ((q | 0) == 16) break;
                else d = d + 32 | 0
            }
            i = j;
            return
        }

        function nc(d, e) {
            d = d | 0;
            e = e | 0;
            var f = 0,
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
                D = 0;
            m = i;
            i = i + 320 | 0;
            g = m + 256 | 0;
            l = m + 192 | 0;
            o = m + 160 | 0;
            s = m + 128 | 0;
            u = m + 112 | 0;
            t = m + 96 | 0;
            f = m + 64 | 0;
            j = m + 32 | 0;
            h = m + 16 | 0;
            k = m;
            q = (e | 0) > 32;
            x = e + 4 | 0;
            v = u + 4 | 0;
            w = u + 8 | 0;
            n = u + 12 | 0;
            p = 0;
            x = (x | 0) > 32 ? 32 : x;
            r = d;
            while (1) {
                y = l + 0 | 0;
                z = y + 64 | 0;
                do {
                    c[y >> 2] = 0;
                    y = y + 4 | 0
                } while ((y | 0) < (z | 0));
                B = (x | 0) > 1;
                A = 0;
                do {
                    if (B) {
                        z = l + (A << 2) | 0;
                        y = c[z >> 2] | 0;
                        C = 1;
                        do {
                            y = ($(b[r + (C << 5 << 1) >> 1] | 0, a[1664 + (C << 5) + A >> 0] | 0) | 0) + y | 0;
                            C = C + 2 | 0
                        } while ((C | 0) < (x | 0));
                        c[z >> 2] = y
                    }
                    A = A + 1 | 0
                } while ((A | 0) != 16);
                c[s + 0 >> 2] = 0;
                c[s + 4 >> 2] = 0;
                c[s + 8 >> 2] = 0;
                c[s + 12 >> 2] = 0;
                c[s + 16 >> 2] = 0;
                c[s + 20 >> 2] = 0;
                c[s + 24 >> 2] = 0;
                c[s + 28 >> 2] = 0;
                y = (x | 0) / 2 | 0;
                z = (x | 0) > 3;
                A = 0;
                do {
                    if (z) {
                        D = s + (A << 2) | 0;
                        B = c[D >> 2] | 0;
                        C = 1;
                        do {
                            B = ($(b[r + (C << 6 << 1) >> 1] | 0, a[1664 + (C << 1 << 5) + A >> 0] | 0) | 0) + B | 0;
                            C = C + 2 | 0
                        } while ((C | 0) < (y | 0));
                        c[D >> 2] = B
                    }
                    A = A + 1 | 0
                } while ((A | 0) != 8);
                c[t + 0 >> 2] = 0;
                c[t + 4 >> 2] = 0;
                c[t + 8 >> 2] = 0;
                c[t + 12 >> 2] = 0;
                A = 0;
                do {
                    B = t + (A << 2) | 0;
                    z = c[B >> 2] | 0;
                    y = 1;
                    do {
                        z = ($(b[r + (y << 7 << 1) >> 1] | 0, a[1664 + (y << 2 << 5) + A >> 0] | 0) | 0) + z | 0;
                        y = y + 2 | 0
                    } while ((y | 0) < 8);
                    c[B >> 2] = z;
                    A = A + 1 | 0
                } while ((A | 0) != 4);
                C = b[r >> 1] << 6;
                B = b[r + 1024 >> 1] << 6;
                D = B + C | 0;
                B = C - B | 0;
                C = b[r + 512 >> 1] | 0;
                y = b[r + 1536 >> 1] | 0;
                z = (y * 36 | 0) + (C * 83 | 0) | 0;
                C = ($(y, -83) | 0) + (C * 36 | 0) | 0;
                y = z + D | 0;
                c[u >> 2] = y;
                c[v >> 2] = C + B;
                c[w >> 2] = B - C;
                c[n >> 2] = D - z;
                z = 0;
                while (1) {
                    D = c[t + (z << 2) >> 2] | 0;
                    c[o + (z << 2) >> 2] = D + y;
                    c[o + (7 - z << 2) >> 2] = y - D;
                    z = z + 1 | 0;
                    if ((z | 0) == 4) {
                        y = 0;
                        break
                    }
                    y = c[u + (z << 2) >> 2] | 0
                }
                do {
                    C = c[o + (y << 2) >> 2] | 0;
                    D = c[s + (y << 2) >> 2] | 0;
                    c[g + (y << 2) >> 2] = D + C;
                    c[g + (15 - y << 2) >> 2] = C - D;
                    y = y + 1 | 0
                } while ((y | 0) != 8);
                y = 0;
                do {
                    z = c[g + (y << 2) >> 2] | 0;
                    A = c[l + (y << 2) >> 2] | 0;
                    B = z + 64 + A | 0;
                    C = B >> 7;
                    if ((C + 32768 | 0) >>> 0 > 65535) C = B >> 31 ^ 32767;
                    b[r + (y << 5 << 1) >> 1] = C;
                    z = z - A + 64 | 0;
                    A = z >> 7;
                    if ((A + 32768 | 0) >>> 0 > 65535) A = z >> 31 ^ 32767;
                    b[r + (31 - y << 5 << 1) >> 1] = A;
                    y = y + 1 | 0
                } while ((y | 0) != 16);
                if ((x | 0) < 32) x = (p & 3 | 0) == 0 & (p | 0) != 0 ? x + -4 | 0 : x;
                p = p + 1 | 0;
                if ((p | 0) == 32) break;
                else r = r + 2 | 0
            }
            p = q ? 32 : e;
            o = (p | 0) > 1;
            n = (p | 0) / 2 | 0;
            q = (p | 0) > 3;
            s = h + 4 | 0;
            r = h + 8 | 0;
            e = h + 12 | 0;
            t = 0;
            while (1) {
                y = l + 0 | 0;
                z = y + 64 | 0;
                do {
                    c[y >> 2] = 0;
                    y = y + 4 | 0
                } while ((y | 0) < (z | 0));
                v = 0;
                do {
                    if (o) {
                        w = l + (v << 2) | 0;
                        u = c[w >> 2] | 0;
                        x = 1;
                        do {
                            u = ($(b[d + (x << 1) >> 1] | 0, a[1664 + (x << 5) + v >> 0] | 0) | 0) + u | 0;
                            x = x + 2 | 0
                        } while ((x | 0) < (p | 0));
                        c[w >> 2] = u
                    }
                    v = v + 1 | 0
                } while ((v | 0) != 16);
                c[j + 0 >> 2] = 0;
                c[j + 4 >> 2] = 0;
                c[j + 8 >> 2] = 0;
                c[j + 12 >> 2] = 0;
                c[j + 16 >> 2] = 0;
                c[j + 20 >> 2] = 0;
                c[j + 24 >> 2] = 0;
                c[j + 28 >> 2] = 0;
                x = 0;
                do {
                    if (q) {
                        u = j + (x << 2) | 0;
                        w = c[u >> 2] | 0;
                        v = 1;
                        do {
                            D = v << 1;
                            w = ($(b[d + (D << 1) >> 1] | 0, a[1664 + (D << 5) + x >> 0] | 0) | 0) + w | 0;
                            v = v + 2 | 0
                        } while ((v | 0) < (n | 0));
                        c[u >> 2] = w
                    }
                    x = x + 1 | 0
                } while ((x | 0) != 8);
                c[k + 0 >> 2] = 0;
                c[k + 4 >> 2] = 0;
                c[k + 8 >> 2] = 0;
                c[k + 12 >> 2] = 0;
                u = 0;
                do {
                    v = k + (u << 2) | 0;
                    x = c[v >> 2] | 0;
                    w = 1;
                    do {
                        D = w << 2;
                        x = ($(b[d + (D << 1) >> 1] | 0, a[1664 + (D << 5) + u >> 0] | 0) | 0) + x | 0;
                        w = w + 2 | 0
                    } while ((w | 0) < 8);
                    c[v >> 2] = x;
                    u = u + 1 | 0
                } while ((u | 0) != 4);
                C = b[d >> 1] << 6;
                B = b[d + 32 >> 1] << 6;
                D = B + C | 0;
                B = C - B | 0;
                C = b[d + 16 >> 1] | 0;
                u = b[d + 48 >> 1] | 0;
                v = (u * 36 | 0) + (C * 83 | 0) | 0;
                C = ($(u, -83) | 0) + (C * 36 | 0) | 0;
                u = v + D | 0;
                c[h >> 2] = u;
                c[s >> 2] = C + B;
                c[r >> 2] = B - C;
                c[e >> 2] = D - v;
                v = 0;
                while (1) {
                    D = c[k + (v << 2) >> 2] | 0;
                    c[f + (v << 2) >> 2] = D + u;
                    c[f + (7 - v << 2) >> 2] = u - D;
                    v = v + 1 | 0;
                    if ((v | 0) == 4) {
                        u = 0;
                        break
                    }
                    u = c[h + (v << 2) >> 2] | 0
                }
                do {
                    C = c[f + (u << 2) >> 2] | 0;
                    D = c[j + (u << 2) >> 2] | 0;
                    c[g + (u << 2) >> 2] = D + C;
                    c[g + (15 - u << 2) >> 2] = C - D;
                    u = u + 1 | 0
                } while ((u | 0) != 8);
                u = 0;
                do {
                    v = c[g + (u << 2) >> 2] | 0;
                    w = c[l + (u << 2) >> 2] | 0;
                    x = v + 2048 + w | 0;
                    y = x >> 12;
                    if ((y + 32768 | 0) >>> 0 > 65535) y = x >> 31 ^ 32767;
                    b[d + (u << 1) >> 1] = y;
                    v = v - w + 2048 | 0;
                    w = v >> 12;
                    if ((w + 32768 | 0) >>> 0 > 65535) w = v >> 31 ^ 32767;
                    b[d + (31 - u << 1) >> 1] = w;
                    u = u + 1 | 0
                } while ((u | 0) != 16);
                t = t + 1 | 0;
                if ((t | 0) == 32) break;
                else d = d + 64 | 0
            }
            i = m;
            return
        }

        function oc(a) {
            a = a | 0;
            var c = 0,
                d = 0,
                e = 0,
                f = 0;
            c = i;
            d = ((((b[a >> 1] | 0) + 1 | 0) >>> 1) + 32 | 0) >>> 6 & 65535;
            e = 0;
            do {
                f = e << 2;
                b[a + (f << 1) >> 1] = d;
                b[a + ((f | 1) << 1) >> 1] = d;
                b[a + ((f | 2) << 1) >> 1] = d;
                b[a + ((f | 3) << 1) >> 1] = d;
                e = e + 1 | 0
            } while ((e | 0) != 4);
            i = c;
            return
        }

        function pc(a) {
            a = a | 0;
            var c = 0,
                d = 0,
                e = 0,
                f = 0;
            c = i;
            d = ((((b[a >> 1] | 0) + 1 | 0) >>> 1) + 32 | 0) >>> 6 & 65535;
            e = 0;
            do {
                f = e << 3;
                b[a + (f << 1) >> 1] = d;
                b[a + ((f | 1) << 1) >> 1] = d;
                b[a + ((f | 2) << 1) >> 1] = d;
                b[a + ((f | 3) << 1) >> 1] = d;
                b[a + ((f | 4) << 1) >> 1] = d;
                b[a + ((f | 5) << 1) >> 1] = d;
                b[a + ((f | 6) << 1) >> 1] = d;
                b[a + ((f | 7) << 1) >> 1] = d;
                e = e + 1 | 0
            } while ((e | 0) != 8);
            i = c;
            return
        }

        function qc(a) {
            a = a | 0;
            var c = 0,
                d = 0,
                e = 0,
                f = 0,
                g = 0;
            c = i;
            e = ((((b[a >> 1] | 0) + 1 | 0) >>> 1) + 32 | 0) >>> 6 & 65535;
            d = 0;
            do {
                f = d << 4;
                g = 0;
                do {
                    b[a + (g + f << 1) >> 1] = e;
                    g = g + 1 | 0
                } while ((g | 0) != 16);
                d = d + 1 | 0
            } while ((d | 0) != 16);
            i = c;
            return
        }

        function rc(a) {
            a = a | 0;
            var c = 0,
                d = 0,
                e = 0,
                f = 0,
                g = 0;
            c = i;
            e = ((((b[a >> 1] | 0) + 1 | 0) >>> 1) + 32 | 0) >>> 6 & 65535;
            d = 0;
            do {
                f = d << 5;
                g = 0;
                do {
                    b[a + (g + f << 1) >> 1] = e;
                    g = g + 1 | 0
                } while ((g | 0) != 32);
                d = d + 1 | 0
            } while ((d | 0) != 32);
            i = c;
            return
        }

        function sc(e, f, g, h, j, k, l, m, n) {
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
                q = 0;
            o = i;
            i = i + 128 | 0;
            k = o;
            q = k + 0 | 0;
            p = q + 128 | 0;
            do {
                c[q >> 2] = 0;
                q = q + 4 | 0
            } while ((q | 0) < (p | 0));
            q = d[j + n + 96 >> 0] | 0;
            c[k + ((q & 31) << 2) >> 2] = b[j + (n * 10 | 0) + 114 >> 1];
            c[k + ((q + 1 & 31) << 2) >> 2] = b[j + (n * 10 | 0) + 116 >> 1];
            c[k + ((q + 2 & 31) << 2) >> 2] = b[j + (n * 10 | 0) + 118 >> 1];
            c[k + ((q + 3 & 31) << 2) >> 2] = b[j + (n * 10 | 0) + 120 >> 1];
            if ((m | 0) <= 0) {
                i = o;
                return
            }
            n = (l | 0) > 0;
            j = 0;
            while (1) {
                if (n) {
                    p = 0;
                    do {
                        q = d[f + p >> 0] | 0;
                        q = q + (c[k + (q >>> 3 << 2) >> 2] | 0) | 0;
                        if (q >>> 0 > 255) q = 0 - q >> 31;
                        a[e + p >> 0] = q;
                        p = p + 1 | 0
                    } while ((p | 0) != (l | 0))
                }
                j = j + 1 | 0;
                if ((j | 0) == (m | 0)) break;
                else {
                    e = e + g | 0;
                    f = f + h | 0
                }
            }
            i = o;
            return
        }

        function tc(e, f, g, h, j, k, l, m, n, o, p, q) {
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
            var r = 0,
                s = 0,
                t = 0,
                u = 0;
            p = i;
            o = j + (n * 10 | 0) + 112 | 0;
            r = c[j + (n << 2) + 100 >> 2] | 0;
            if ((r | 0) != 1) {
                if (c[k >> 2] | 0) {
                    q = b[o >> 1] | 0;
                    if ((m | 0) > 0) {
                        s = 0;
                        do {
                            t = (d[f + ($(s, h) | 0) >> 0] | 0) + q | 0;
                            if (t >>> 0 > 255) t = 0 - t >> 31;
                            a[e + ($(s, g) | 0) >> 0] = t;
                            s = s + 1 | 0
                        } while ((s | 0) != (m | 0));
                        q = 1
                    } else q = 1
                } else q = 0;
                if (c[k + 8 >> 2] | 0) {
                    s = b[o >> 1] | 0;
                    l = l + -1 | 0;
                    if ((m | 0) > 0) {
                        t = 0;
                        do {
                            u = (d[f + (($(t, h) | 0) + l) >> 0] | 0) + s | 0;
                            if (u >>> 0 > 255) u = 0 - u >> 31;
                            a[e + (($(t, g) | 0) + l) >> 0] = u;
                            t = t + 1 | 0
                        } while ((t | 0) != (m | 0))
                    }
                }
                if (!r) {
                    s = m;
                    t = q;
                    u = 0;
                    r = l;
                    Bc(e, f, g, h, j, r, s, n, t, u);
                    i = p;
                    return
                }
            } else q = 0;
            if (c[k + 4 >> 2] | 0) {
                r = b[o >> 1] | 0;
                if ((q | 0) < (l | 0)) {
                    s = q;
                    do {
                        t = (d[f + s >> 0] | 0) + r | 0;
                        if (t >>> 0 > 255) t = 0 - t >> 31;
                        a[e + s >> 0] = t;
                        s = s + 1 | 0
                    } while ((s | 0) != (l | 0));
                    r = 1
                } else r = 1
            } else r = 0;
            if (!(c[k + 12 >> 2] | 0)) {
                s = m;
                t = q;
                u = r;
                r = l;
                Bc(e, f, g, h, j, r, s, n, t, u);
                i = p;
                return
            }
            k = b[o >> 1] | 0;
            o = m + -1 | 0;
            t = $(o, g) | 0;
            m = $(o, h) | 0;
            if ((q | 0) < (l | 0)) s = q;
            else {
                s = o;
                t = q;
                u = r;
                r = l;
                Bc(e, f, g, h, j, r, s, n, t, u);
                i = p;
                return
            }
            do {
                u = (d[f + (s + m) >> 0] | 0) + k | 0;
                if (u >>> 0 > 255) u = 0 - u >> 31;
                a[e + (s + t) >> 0] = u;
                s = s + 1 | 0
            } while ((s | 0) != (l | 0));
            Bc(e, f, g, h, j, l, o, n, q, r);
            i = p;
            return
        }

        function uc(e, f, g, h, j, k, l, m, n, o, p, q) {
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
            var r = 0,
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
                J = 0;
            s = i;
            C = j + (n * 10 | 0) + 112 | 0;
            B = c[j + (n << 2) + 100 >> 2] | 0;
            A = (B | 0) != 1;
            if (A) {
                if (c[k >> 2] | 0) {
                    D = b[C >> 1] | 0;
                    if ((m | 0) > 0) {
                        E = 0;
                        do {
                            G = (d[f + ($(E, h) | 0) >> 0] | 0) + D | 0;
                            if (G >>> 0 > 255) G = 0 - G >> 31;
                            a[e + ($(E, g) | 0) >> 0] = G;
                            E = E + 1 | 0
                        } while ((E | 0) != (m | 0));
                        D = 1
                    } else D = 1
                } else D = 0;
                if (c[k + 8 >> 2] | 0) {
                    E = b[C >> 1] | 0;
                    l = l + -1 | 0;
                    if ((m | 0) > 0) {
                        G = 0;
                        do {
                            H = (d[f + (($(G, h) | 0) + l) >> 0] | 0) + E | 0;
                            if (H >>> 0 > 255) H = 0 - H >> 31;
                            a[e + (($(G, g) | 0) + l) >> 0] = H;
                            G = G + 1 | 0
                        } while ((G | 0) != (m | 0))
                    }
                }
                if (!B) {
                    C = 1;
                    E = 0
                } else F = 13
            } else {
                D = 0;
                F = 13
            }
            if ((F | 0) == 13) {
                if (c[k + 4 >> 2] | 0) {
                    F = b[C >> 1] | 0;
                    if ((D | 0) < (l | 0)) {
                        E = D;
                        do {
                            G = (d[f + E >> 0] | 0) + F | 0;
                            if (G >>> 0 > 255) G = 0 - G >> 31;
                            a[e + E >> 0] = G;
                            E = E + 1 | 0
                        } while ((E | 0) != (l | 0));
                        E = 1
                    } else E = 1
                } else E = 0;
                if (c[k + 12 >> 2] | 0) {
                    C = b[C >> 1] | 0;
                    m = m + -1 | 0;
                    G = $(m, g) | 0;
                    H = $(m, h) | 0;
                    if ((D | 0) < (l | 0)) {
                        F = D;
                        do {
                            I = (d[f + (F + H) >> 0] | 0) + C | 0;
                            if (I >>> 0 > 255) I = 0 - I >> 31;
                            a[e + (F + G) >> 0] = I;
                            F = F + 1 | 0
                        } while ((F | 0) != (l | 0));
                        C = 0
                    } else C = 0
                } else C = 0
            }
            Bc(e, f, g, h, j, l, m, n, D, E);
            j = (B | 0) == 2;
            if ((a[q >> 0] | 0) == 0 & j ? (c[k >> 2] | 0) == 0 : 0) n = (c[k + 4 >> 2] | 0) == 0;
            else n = 0;
            H = n & 1;
            n = q + 1 | 0;
            B = (B | 0) == 3;
            if ((a[n >> 0] | 0) == 0 & B ? (c[k + 4 >> 2] | 0) == 0 : 0) F = (c[k + 8 >> 2] | 0) == 0;
            else F = 0;
            J = F & 1;
            F = q + 2 | 0;
            if ((a[F >> 0] | 0) == 0 & j ? (c[k + 8 >> 2] | 0) == 0 : 0) G = (c[k + 12 >> 2] | 0) == 0;
            else G = 0;
            I = G & 1;
            G = q + 3 | 0;
            if ((a[G >> 0] | 0) == 0 & B ? (c[k >> 2] | 0) == 0 : 0) k = (c[k + 12 >> 2] | 0) == 0;
            else k = 0;
            k = k & 1;
            A = A ^ 1;
            if (!((a[o >> 0] | 0) == 0 | A) ? (z = H + E | 0, y = m - k | 0, (z | 0) < (y | 0)) : 0)
                do {
                    a[e + ($(z, g) | 0) >> 0] = a[f + ($(z, h) | 0) >> 0] | 0;
                    z = z + 1 | 0
                } while ((z | 0) != (y | 0));
            if (!((a[o + 1 >> 0] | 0) == 0 | A) ? (x = J + E | 0, w = m - I | 0, (x | 0) < (w | 0)) : 0) {
                o = l + -1 | 0;
                do {
                    a[e + (o + ($(x, g) | 0)) >> 0] = a[f + (o + ($(x, h) | 0)) >> 0] | 0;
                    x = x + 1 | 0
                } while ((x | 0) != (w | 0))
            }
            if (!((a[p >> 0] | 0) == 0 | C) ? (v = H + D | 0, u = l - J | 0, (v | 0) < (u | 0)) : 0)
                do {
                    a[e + v >> 0] = a[f + v >> 0] | 0;
                    v = v + 1 | 0
                } while ((v | 0) != (u | 0));
            if (!((a[p + 1 >> 0] | 0) == 0 | C) ? (t = k + D | 0, r = l - I | 0, (t | 0) < (r | 0)) : 0) {
                u = m + -1 | 0;
                p = $(u, h) | 0;
                u = $(u, g) | 0;
                do {
                    a[e + (t + u) >> 0] = a[f + (t + p) >> 0] | 0;
                    t = t + 1 | 0
                } while ((t | 0) != (r | 0))
            }
            if ((a[q >> 0] | 0) != 0 & j) a[e >> 0] = a[f >> 0] | 0;
            if ((a[n >> 0] | 0) != 0 & B) {
                J = l + -1 | 0;
                a[e + J >> 0] = a[f + J >> 0] | 0
            }
            if ((a[F >> 0] | 0) != 0 & j) {
                J = m + -1 | 0;
                I = l + -1 | 0;
                a[e + (I + ($(J, g) | 0)) >> 0] = a[f + (I + ($(J, h) | 0)) >> 0] | 0
            }
            if (!((a[G >> 0] | 0) != 0 & B)) {
                i = s;
                return
            }
            J = m + -1 | 0;
            a[e + ($(J, g) | 0) >> 0] = a[f + ($(J, h) | 0) >> 0] | 0;
            i = s;
            return
        }

        function vc(a, b, c, d, e, f) {
            a = a | 0;
            b = b | 0;
            c = c | 0;
            d = d | 0;
            e = e | 0;
            f = f | 0;
            var g = 0;
            g = i;
            Ac(a, b, 1, c, d, e, f);
            i = g;
            return
        }

        function wc(a, b, c, d, e, f) {
            a = a | 0;
            b = b | 0;
            c = c | 0;
            d = d | 0;
            e = e | 0;
            f = f | 0;
            var g = 0;
            g = i;
            Ac(a, 1, b, c, d, e, f);
            i = g;
            return
        }

        function xc(a, b, c, d, e) {
            a = a | 0;
            b = b | 0;
            c = c | 0;
            d = d | 0;
            e = e | 0;
            var f = 0;
            f = i;
            zc(a, b, 1, c, d, e);
            i = f;
            return
        }

        function yc(a, b, c, d, e) {
            a = a | 0;
            b = b | 0;
            c = c | 0;
            d = d | 0;
            e = e | 0;
            var f = 0;
            f = i;
            zc(a, 1, b, c, d, e);
            i = f;
            return
        }

        function zc(b, e, f, g, h, j) {
            b = b | 0;
            e = e | 0;
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
                x = 0;
            m = i;
            l = $(e, -2) | 0;
            k = 0 - e | 0;
            n = 0;
            while (1) {
                p = c[g + (n << 2) >> 2] | 0;
                if ((p | 0) >= 1) {
                    s = 0 - p | 0;
                    r = (a[h + n >> 0] | 0) == 0;
                    q = (a[j + n >> 0] | 0) == 0;
                    o = 0;
                    t = b;
                    while (1) {
                        v = t + k | 0;
                        x = d[v >> 0] | 0;
                        u = d[t >> 0] | 0;
                        w = (d[t + l >> 0] | 0) + 4 - (d[t + e >> 0] | 0) + (u - x << 2) >> 3;
                        if ((w | 0) < (s | 0)) w = s;
                        else w = (w | 0) > (p | 0) ? p : w;
                        if (r) {
                            x = w + x | 0;
                            if (x >>> 0 > 255) x = 0 - x >> 31;
                            a[v >> 0] = x
                        }
                        if (q) {
                            u = u - w | 0;
                            if (u >>> 0 > 255) u = 0 - u >> 31;
                            a[t >> 0] = u
                        }
                        o = o + 1 | 0;
                        if ((o | 0) == 4) break;
                        else t = t + f | 0
                    }
                }
                n = n + 1 | 0;
                if ((n | 0) == 2) break;
                else b = b + (f << 2) | 0
            }
            i = m;
            return
        }

        function Ac(b, e, f, g, h, j, k) {
            b = b | 0;
            e = e | 0;
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
                ba = 0;
            t = i;
            o = $(e, -3) | 0;
            p = $(e, -2) | 0;
            q = 0 - e | 0;
            r = e << 1;
            D = f * 3 | 0;
            B = D + o | 0;
            C = D + p | 0;
            A = D - e | 0;
            E = D + r | 0;
            l = D + e | 0;
            y = g >> 3;
            v = g >> 2;
            n = $(e, -4) | 0;
            s = e * 3 | 0;
            w = D + n | 0;
            x = (f + e | 0) * 3 | 0;
            u = (g >> 1) + g >> 3;
            z = f << 2;
            m = f << 2;
            F = 0;
            do {
                U = a[b + o >> 0] | 0;
                T = a[b + p >> 0] | 0;
                S = a[b + q >> 0] | 0;
                J = S & 255;
                N = (U & 255) - ((T & 255) << 1) + J | 0;
                N = (N | 0) > -1 ? N : 0 - N | 0;
                P = a[b + r >> 0] | 0;
                Q = a[b + e >> 0] | 0;
                R = a[b >> 0] | 0;
                X = R & 255;
                V = (P & 255) - ((Q & 255) << 1) + X | 0;
                V = (V | 0) > -1 ? V : 0 - V | 0;
                _ = d[b + A >> 0] | 0;
                M = (d[b + B >> 0] | 0) - ((d[b + C >> 0] | 0) << 1) + _ | 0;
                M = (M | 0) > -1 ? M : 0 - M | 0;
                Y = d[b + D >> 0] | 0;
                O = (d[b + E >> 0] | 0) - ((d[b + l >> 0] | 0) << 1) + Y | 0;
                O = (O | 0) > -1 ? O : 0 - O | 0;
                H = V + N | 0;
                I = O + M | 0;
                G = c[h + (F << 2) >> 2] | 0;
                W = a[j + F >> 0] | 0;
                L = a[k + F >> 0] | 0;
                do
                    if ((I + H | 0) < (g | 0)) {
                        Z = (G * 5 | 0) + 1 >> 1;
                        aa = (d[b + n >> 0] | 0) - J | 0;
                        K = a[b + s >> 0] | 0;
                        ba = (K & 255) - X | 0;
                        if ((((((((ba | 0) > -1 ? ba : 0 - ba | 0) + ((aa | 0) > -1 ? aa : 0 - aa | 0) | 0) < (y | 0) ? (ba = J - X | 0, (((ba | 0) > -1 ? ba : 0 - ba | 0) | 0) < (Z | 0)) : 0) ? (ba = (d[b + w >> 0] | 0) - _ | 0, aa = (d[b + x >> 0] | 0) - Y | 0, (((aa | 0) > -1 ? aa : 0 - aa | 0) + ((ba | 0) > -1 ? ba : 0 - ba | 0) | 0) < (y | 0)) : 0) ? (ba = _ - Y | 0, (((ba | 0) > -1 ? ba : 0 - ba | 0) | 0) < (Z | 0)) : 0) ? (H << 1 | 0) < (v | 0) : 0) ? (I << 1 | 0) < (v | 0) : 0) {
                            G = G << 1;
                            H = W << 24 >> 24 == 0;
                            I = 0 - G | 0;
                            J = L << 24 >> 24 == 0;
                            Y = K;
                            K = 1;
                            L = b;
                            while (1) {
                                V = L + o | 0;
                                U = U & 255;
                                W = L + p | 0;
                                T = T & 255;
                                X = L + q | 0;
                                N = S & 255;
                                R = R & 255;
                                S = L + e | 0;
                                Q = Q & 255;
                                M = L + r | 0;
                                O = P & 255;
                                P = Y & 255;
                                if (H) {
                                    Y = d[L + n >> 0] | 0;
                                    Z = (U + 4 + Q + (N + T + R << 1) >> 3) - N | 0;
                                    if ((Z | 0) < (I | 0)) Z = I;
                                    else Z = (Z | 0) > (G | 0) ? G : Z;
                                    a[X >> 0] = Z + N;
                                    X = ((U + 2 + T + N + R | 0) >>> 2) - T | 0;
                                    if ((X | 0) < (I | 0)) X = I;
                                    else X = (X | 0) > (G | 0) ? G : X;
                                    a[W >> 0] = X + T;
                                    W = ((U * 3 | 0) + 4 + T + N + R + (Y << 1) >> 3) - U | 0;
                                    if ((W | 0) < (I | 0)) W = I;
                                    else W = (W | 0) > (G | 0) ? G : W;
                                    a[V >> 0] = W + U
                                }
                                if (J) {
                                    T = (T + 4 + O + (R + N + Q << 1) >> 3) - R | 0;
                                    if ((T | 0) < (I | 0)) T = I;
                                    else T = (T | 0) > (G | 0) ? G : T;
                                    a[L >> 0] = T + R;
                                    T = ((N + 2 + R + Q + O | 0) >>> 2) - Q | 0;
                                    if ((T | 0) < (I | 0)) T = I;
                                    else T = (T | 0) > (G | 0) ? G : T;
                                    a[S >> 0] = T + Q;
                                    N = (N + 4 + R + Q + (O * 3 | 0) + (P << 1) >> 3) - O | 0;
                                    if ((N | 0) < (I | 0)) N = I;
                                    else N = (N | 0) > (G | 0) ? G : N;
                                    a[M >> 0] = N + O
                                }
                                M = L + f | 0;
                                if ((K | 0) == 4) break;
                                U = a[L + (o + f) >> 0] | 0;
                                T = a[L + (p + f) >> 0] | 0;
                                S = a[L + (f - e) >> 0] | 0;
                                R = a[M >> 0] | 0;
                                Q = a[L + (f + e) >> 0] | 0;
                                P = a[L + (r + f) >> 0] | 0;
                                Y = a[L + (s + f) >> 0] | 0;
                                K = K + 1 | 0;
                                L = M
                            }
                            b = b + m | 0;
                            break
                        }
                        H = G >> 1;
                        I = G * 10 | 0;
                        J = 0 - G | 0;
                        K = W << 24 >> 24 != 0;
                        L = L << 24 >> 24 != 0;
                        M = (M + N | 0) < (u | 0) & (K ^ 1);
                        N = 0 - H | 0;
                        O = (O + V | 0) < (u | 0) & (L ^ 1);
                        V = T;
                        W = R;
                        Y = Q;
                        Q = 1;
                        R = b;
                        while (1) {
                            X = U & 255;
                            T = R + p | 0;
                            V = V & 255;
                            _ = R + q | 0;
                            Z = S & 255;
                            W = W & 255;
                            S = R + e | 0;
                            U = Y & 255;
                            P = P & 255;
                            Y = ((W - Z | 0) * 9 | 0) + 8 + ($(U - V | 0, -3) | 0) >> 4;
                            if ((((Y | 0) > -1 ? Y : 0 - Y | 0) | 0) < (I | 0)) {
                                if ((Y | 0) < (J | 0)) Y = J;
                                else Y = (Y | 0) > (G | 0) ? G : Y;
                                if (!K) {
                                    aa = Y + Z | 0;
                                    if (aa >>> 0 > 255) aa = 0 - aa >> 31;
                                    a[_ >> 0] = aa
                                }
                                if (!L) {
                                    _ = W - Y | 0;
                                    if (_ >>> 0 > 255) _ = 0 - _ >> 31;
                                    a[R >> 0] = _
                                }
                                if (M) {
                                    X = ((X + 1 + Z | 0) >>> 1) - V + Y >> 1;
                                    if ((X | 0) < (N | 0)) X = N;
                                    else X = (X | 0) > (H | 0) ? H : X;
                                    V = X + V | 0;
                                    if (V >>> 0 > 255) V = 0 - V >> 31;
                                    a[T >> 0] = V
                                }
                                if (O) {
                                    P = ((W + 1 + P | 0) >>> 1) - U - Y >> 1;
                                    if ((P | 0) < (N | 0)) P = N;
                                    else P = (P | 0) > (H | 0) ? H : P;
                                    P = P + U | 0;
                                    if (P >>> 0 > 255) P = 0 - P >> 31;
                                    a[S >> 0] = P
                                }
                            }
                            T = R + f | 0;
                            if ((Q | 0) == 4) break;
                            U = a[R + (o + f) >> 0] | 0;
                            V = a[R + (p + f) >> 0] | 0;
                            S = a[R + (f - e) >> 0] | 0;
                            W = a[T >> 0] | 0;
                            Y = a[R + (f + e) >> 0] | 0;
                            P = a[R + (r + f) >> 0] | 0;
                            Q = Q + 1 | 0;
                            R = T
                        }
                        b = b + m | 0
                    } else b = b + z | 0;
                while (0);
                F = F + 1 | 0
            } while ((F | 0) != 2);
            i = t;
            return
        }

        function Bc(e, f, g, h, j, k, l, m, n, o) {
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
            var p = 0,
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
            t = i;
            v = c[j + (m << 2) + 100 >> 2] | 0;
            q = a[2728 + (v << 2) >> 0] | 0;
            r = a[2730 + (v << 2) >> 0] | 0;
            if ((o | 0) >= (l | 0)) {
                i = t;
                return
            }
            u = (n | 0) < (k | 0);
            s = o;
            p = $((a[2729 + (v << 2) >> 0] | 0) + o | 0, h) | 0;
            v = $((a[2731 + (v << 2) >> 0] | 0) + o | 0, h) | 0;
            w = $(o, g) | 0;
            o = $(o, h) | 0;
            while (1) {
                if (u) {
                    y = p + q | 0;
                    x = v + r | 0;
                    z = n;
                    do {
                        A = a[f + (z + o) >> 0] | 0;
                        B = a[f + (y + z) >> 0] | 0;
                        if ((A & 255) > (B & 255)) B = 3;
                        else B = ((A << 24 >> 24 != B << 24 >> 24) << 31 >> 31) + 2 | 0;
                        C = a[f + (x + z) >> 0] | 0;
                        if ((A & 255) > (C & 255)) C = 1;
                        else C = (A << 24 >> 24 != C << 24 >> 24) << 31 >> 31;
                        A = (b[j + (m * 10 | 0) + (d[2720 + (C + B) >> 0] << 1) + 112 >> 1] | 0) + (A & 255) | 0;
                        if (A >>> 0 > 255) A = 0 - A >> 31;
                        a[e + (z + w) >> 0] = A;
                        z = z + 1 | 0
                    } while ((z | 0) != (k | 0))
                }
                s = s + 1 | 0;
                if ((s | 0) == (l | 0)) break;
                else {
                    p = p + h | 0;
                    v = v + h | 0;
                    w = w + g | 0;
                    o = o + h | 0
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
                v = 0;
            f = i;
            i = i + 16 | 0;
            e = f;
            h = c[b + 136 >> 2] | 0;
            g = h + 204 | 0;
            j = td(13196) | 0;
            c[e >> 2] = j;
            if (!j) {
                t = -12;
                i = f;
                return t | 0
            }
            j = c[j + 4 >> 2] | 0;
            l = td(468) | 0;
            if (!l) {
                t = -12;
                i = f;
                return t | 0
            }
            k = c[l + 4 >> 2] | 0;
            c[k + 4 >> 2] = 1;
            n = k + 8 | 0;
            c[n >> 2] = 1;
            a[k >> 0] = 0;
            c[k + 348 >> 2] = 1;
            p = k + 352 | 0;
            m = k + 380 | 0;
            q = k + 408 | 0;
            o = 0;
            do {
                c[p + (o << 2) >> 2] = 1;
                c[m + (o << 2) >> 2] = 0;
                c[q + (o << 2) >> 2] = -1;
                o = o + 1 | 0
            } while ((o | 0) < (c[n >> 2] | 0));
            c[k + 436 >> 2] = 0;
            c[k + 440 >> 2] = 1;
            a[k + 444 >> 0] = 0;
            o = b + 208 | 0;
            vd(o);
            c[o >> 2] = l;
            c[j >> 2] = 0;
            o = j + 72 | 0;
            c[o >> 2] = 1;
            t = _c(g, 8) | 0;
            p = j + 4 | 0;
            c[p >> 2] = t;
            do
                if ((t | 0) <= 3) {
                    a[j + 8 >> 0] = 0;
                    n = j + 13120 | 0;
                    c[n >> 2] = cd(g, 32) | 0;
                    k = cd(g, 32) | 0;
                    m = j + 13124 | 0;
                    c[m >> 2] = k;
                    k = Qc(c[n >> 2] | 0, k, 0, c[b + 4 >> 2] | 0) | 0;
                    if ((k | 0) >= 0) {
                        t = _c(g, 8) | 0;
                        l = j + 52 | 0;
                        c[l >> 2] = t + 8;
                        if (!t) {
                            p = c[p >> 2] | 0;
                            if ((p | 0) == 1) {
                                c[j + 60 >> 2] = 0;
                                p = 0
                            } else if ((p | 0) == 2) {
                                c[j + 60 >> 2] = 4;
                                p = 4
                            } else if (!p) {
                                c[j + 60 >> 2] = 8;
                                p = 8
                            } else {
                                c[j + 60 >> 2] = 5;
                                p = 5
                            }
                            c[j + 56 >> 2] = 0;
                            p = Bd(p) | 0;
                            if (p) {
                                c[j + 13180 >> 2] = 0;
                                c[j + 13168 >> 2] = 0;
                                t = d[p + 5 >> 0] | 0;
                                c[j + 13172 >> 2] = t;
                                c[j + 13176 >> 2] = t;
                                t = d[p + 6 >> 0] | 0;
                                c[j + 13184 >> 2] = t;
                                c[j + 13188 >> 2] = t;
                                c[j + 64 >> 2] = 8;
                                if ((c[o >> 2] | 0) > 0) {
                                    p = j + 76 | 0;
                                    q = 0;
                                    do {
                                        c[p + (q * 12 | 0) >> 2] = 1;
                                        c[p + (q * 12 | 0) + 4 >> 2] = 0;
                                        c[p + (q * 12 | 0) + 8 >> 2] = -1;
                                        q = q + 1 | 0
                                    } while ((q | 0) < (c[o >> 2] | 0))
                                }
                                s = (dd(g) | 0) + 3 | 0;
                                t = j + 13064 | 0;
                                c[t >> 2] = s;
                                s = 1 << s;
                                r = s + -1 | 0;
                                s = 0 - s | 0;
                                c[n >> 2] = r + (c[n >> 2] | 0) & s;
                                c[m >> 2] = r + (c[m >> 2] | 0) & s;
                                s = j + 13068 | 0;
                                c[s >> 2] = dd(g) | 0;
                                r = j + 13072 | 0;
                                c[r >> 2] = (dd(g) | 0) + 2;
                                o = dd(g) | 0;
                                p = c[r >> 2] | 0;
                                q = j + 13076 | 0;
                                c[q >> 2] = p + o;
                                if (p >>> 0 < (c[t >> 2] | 0) >>> 0) {
                                    u = dd(g) | 0;
                                    o = j + 13092 | 0;
                                    c[o >> 2] = u;
                                    p = j + 13088 | 0;
                                    c[p >> 2] = u;
                                    a[j + 12940 >> 0] = 1;
                                    a[j + 12941 >> 0] = bd(g) | 0;
                                    u = bd(g) | 0;
                                    c[j + 68 >> 2] = u;
                                    if (u) {
                                        u = j + 13044 | 0;
                                        a[u >> 0] = (_c(g, 4) | 0) + 1;
                                        a[j + 13045 >> 0] = (_c(g, 4) | 0) + 1;
                                        v = (dd(g) | 0) + 3 | 0;
                                        c[j + 13048 >> 2] = v;
                                        c[j + 13052 >> 2] = v + (dd(g) | 0);
                                        if ((d[u >> 0] | 0 | 0) > (c[l >> 2] | 0)) {
                                            k = -1094995529;
                                            break
                                        }
                                        a[j + 13056 >> 0] = bd(g) | 0
                                    }
                                    c[j + 2184 >> 2] = 0;
                                    a[j + 12942 >> 0] = 0;
                                    a[j + 13060 >> 0] = 1;
                                    a[j + 13061 >> 0] = bd(g) | 0;
                                    c[j + 160 >> 2] = 0;
                                    c[j + 164 >> 2] = 1;
                                    if ((bd(g) | 0) != 0 ? (v = bd(g) | 0, ad(g, 7), (v | 0) != 0) : 0) {
                                        c[j + 13096 >> 2] = bd(g) | 0;
                                        c[j + 13100 >> 2] = bd(g) | 0;
                                        c[j + 13104 >> 2] = bd(g) | 0;
                                        c[j + 13108 >> 2] = bd(g) | 0;
                                        bd(g) | 0;
                                        c[j + 13112 >> 2] = bd(g) | 0;
                                        bd(g) | 0;
                                        c[j + 13116 >> 2] = bd(g) | 0;
                                        bd(g) | 0
                                    }
                                    g = c[n >> 2] | 0;
                                    c[j + 12 >> 2] = g;
                                    n = c[m >> 2] | 0;
                                    c[j + 16 >> 2] = n;
                                    t = c[t >> 2] | 0;
                                    v = (c[s >> 2] | 0) + t | 0;
                                    c[j + 13080 >> 2] = v;
                                    s = t + -1 | 0;
                                    c[j + 13084 >> 2] = s;
                                    m = 1 << v;
                                    u = g + -1 + m >> v;
                                    c[j + 13128 >> 2] = u;
                                    m = n + -1 + m >> v;
                                    c[j + 13132 >> 2] = m;
                                    c[j + 13136 >> 2] = $(m, u) | 0;
                                    c[j + 13140 >> 2] = g >> t;
                                    c[j + 13144 >> 2] = n >> t;
                                    u = c[r >> 2] | 0;
                                    c[j + 13148 >> 2] = g >> u;
                                    c[j + 13152 >> 2] = n >> u;
                                    c[j + 13156 >> 2] = g >> s;
                                    c[j + 13160 >> 2] = n >> s;
                                    u = v - u | 0;
                                    c[j + 13164 >> 2] = (1 << u) + -1;
                                    c[j + 13192 >> 2] = ((c[l >> 2] | 0) * 6 | 0) + -48;
                                    t = (1 << t) + -1 | 0;
                                    if ((((((t & g | 0) == 0 ? !((n & t | 0) != 0 | v >>> 0 > 6) : 0) ? (c[p >> 2] | 0) >>> 0 <= u >>> 0 : 0) ? (c[o >> 2] | 0) >>> 0 <= u >>> 0 : 0) ? (c[q >> 2] | 0) >>> 0 <= (v >>> 0 > 5 ? 5 : v) >>> 0 : 0) ? ((c[h + 216 >> 2] | 0) - (c[h + 212 >> 2] | 0) | 0) >= 0 : 0) {
                                        g = b + 272 | 0;
                                        h = c[g >> 2] | 0;
                                        if ((h | 0) != 0 ? (v = c[e >> 2] | 0, (Yd(c[h + 4 >> 2] | 0, c[v + 4 >> 2] | 0, c[v + 8 >> 2] | 0) | 0) == 0) : 0) {
                                            vd(e);
                                            v = 0;
                                            i = f;
                                            return v | 0
                                        } else h = 0;
                                        do {
                                            j = b + (h << 2) + 400 | 0;
                                            k = c[j >> 2] | 0;
                                            do
                                                if (k) {
                                                    if (c[c[k + 4 >> 2] >> 2] | 0) break;
                                                    vd(j)
                                                }
                                            while (0);
                                            h = h + 1 | 0
                                        } while ((h | 0) != 256);
                                        h = c[g >> 2] | 0;
                                        do
                                            if (h) {
                                                j = b + 200 | 0;
                                                if ((c[j >> 2] | 0) != (c[h + 4 >> 2] | 0)) break;
                                                u = b + 1424 | 0;
                                                vd(u);
                                                v = ud(c[g >> 2] | 0) | 0;
                                                c[u >> 2] = v;
                                                if (v) break;
                                                c[j >> 2] = 0
                                            }
                                        while (0);
                                        vd(g);
                                        c[g >> 2] = c[e >> 2];
                                        v = 0;
                                        i = f;
                                        return v | 0
                                    }
                                } else k = -1094995529
                            } else k = -22
                        } else k = -1094995529
                    }
                } else k = -1094995529;
            while (0);
            vd(e);
            v = k;
            i = f;
            return v | 0
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
                        if ((j | 0) == 256) {
                            Hc(a);
                            break
                        } else if ((j | 0) == 257) {
                    b[f >> 1] = _c(h, 16) | 0;
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
                if ((g | 0) == 2) ad(e, 32);
                else if (!g) {
                    a[f >> 0] = 1;
                    j = 0;
                    do {
                        a[b + (h << 4) + j + 4420 >> 0] = _c(e, 8) | 0;
                        j = j + 1 | 0
                    } while ((j | 0) != 16)
                } else if ((g | 0) == 1) ad(e, 16);
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
            a = Da[c[b + 76 >> 2] & 3](a) | 0;
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
            if ((f | 0) != 0 ? (d = c[f + 92 >> 2] | 0, (d | 0) != 0) : 0) Da[d & 3](a) | 0;
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
            Aa[c[f + 12 >> 2] & 7](c[f + 16 >> 2] | 0, c[f >> 2] | 0);
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
            if (((c[h >> 2] | 0) + -1 | 0) >>> 0 < 2 ? (t = b + 16 | 0, p = c[t >> 2] | 0, j = b + 84 | 0, c[j >> 2] = (p + 1 | 0) / 2 | 0, c[b + 88 >> 2] = ((c[b + 20 >> 2] | 0) + 1 | 0) / 2 | 0, c[b + 124 >> 2] = fd(p) | 0, c[b + 128 >> 2] = fd(c[t >> 2] | 0) | 0, c[b + 196 >> 2] = fd((c[j >> 2] << 1) + 14 | 0) | 0, (c[h >> 2] | 0) == 1) : 0) {
                m = 0;
                do {
                    c[b + (m << 2) + 132 >> 2] = fd(c[j >> 2] | 0) | 0;
                    c[b + (m << 2) + 164 >> 2] = fd(c[j >> 2] | 0) | 0;
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
            if (!(c[h >> 2] | 0)) c[b + 248 >> 2] = 4;
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

        function Gd(b, e) {
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
                o = 0,
                p = 0,
                q = 0,
                r = 0,
                s = 0,
                t = 0,
                u = 0,
                v = 0,
                w = 0;
            g = i;
            h = b + 80 | 0;
            l = c[h >> 2] | 0;
            if (l >>> 0 >= (c[b + 20 >> 2] | 0) >>> 0) {
                u = -1;
                i = g;
                return u | 0
            }
            f = c[b + 16 >> 2] | 0;
            m = (c[b + 92 >> 2] | 0) + ($(c[b + 108 >> 2] | 0, l) | 0) | 0;
            j = b + 76 | 0;
            if (!(a[j >> 0] | 0)) k = (a[b + 78 >> 0] | 0) != 0 ? 4 : 3;
            else k = 4;
            n = c[b + 24 >> 2] | 0;
            if (!n) Ka[c[b + 248 >> 2] & 7](b + 200 | 0, e, m, 0, 0, f, k);
            else if ((n | 0) == 2) {
                u = (c[b + 96 >> 2] | 0) + ($(c[b + 112 >> 2] | 0, l) | 0) | 0;
                p = (c[b + 100 >> 2] | 0) + ($(c[b + 116 >> 2] | 0, l) | 0) | 0;
                t = b + 124 | 0;
                q = b + 30 | 0;
                r = b + 28 | 0;
                s = b + 196 | 0;
                Id(c[t >> 2] | 0, u, f, d[q >> 0] | 0, d[r >> 0] | 0, c[s >> 2] | 0);
                u = b + 128 | 0;
                Id(c[u >> 2] | 0, p, f, d[q >> 0] | 0, d[r >> 0] | 0, c[s >> 2] | 0);
                Ka[c[b + 248 >> 2] & 7](b + 200 | 0, e, m, c[t >> 2] | 0, c[u >> 2] | 0, f, k)
            } else if ((n | 0) == 3) {
                t = (c[b + 96 >> 2] | 0) + ($(c[b + 112 >> 2] | 0, l) | 0) | 0;
                u = (c[b + 100 >> 2] | 0) + ($(c[b + 116 >> 2] | 0, l) | 0) | 0;
                Ka[c[b + 248 >> 2] & 7](b + 200 | 0, e, m, t, u, f, k)
            } else if ((n | 0) == 1) {
                if (!l) {
                    n = b + 96 | 0;
                    o = b + 112 | 0;
                    p = b + 100 | 0;
                    q = b + 116 | 0;
                    r = b + 84 | 0;
                    s = b + 88 | 0;
                    t = 0;
                    do {
                        u = (t | 0) > 4 ? t + -8 | 0 : t;
                        if ((u | 0) < 0) u = 0;
                        else {
                            v = c[s >> 2] | 0;
                            u = (u | 0) < (v | 0) ? u : v + -1 | 0
                        }
                        w = (c[n >> 2] | 0) + ($(c[o >> 2] | 0, u) | 0) | 0;
                        v = (c[p >> 2] | 0) + ($(c[q >> 2] | 0, u) | 0) | 0;
                        fe(c[b + (t << 2) + 132 >> 2] | 0, w | 0, c[r >> 2] | 0) | 0;
                        fe(c[b + (t << 2) + 164 >> 2] | 0, v | 0, c[r >> 2] | 0) | 0;
                        t = t + 1 | 0
                    } while ((t | 0) != 8)
                }
                o = l >> 1;
                q = (o | 0) % 8 | 0;
                w = l & 1;
                n = b + 124 | 0;
                t = b + 196 | 0;
                u = b + 30 | 0;
                v = b + 28 | 0;
                Hd(c[n >> 2] | 0, b + 132 | 0, f, q, c[t >> 2] | 0, d[u >> 0] | 0, w, d[v >> 0] | 0);
                p = b + 128 | 0;
                Hd(c[p >> 2] | 0, b + 164 | 0, f, q, c[t >> 2] | 0, d[u >> 0] | 0, w, d[v >> 0] | 0);
                if (w) {
                    u = (q + 5 | 0) % 8 | 0;
                    t = o + 5 | 0;
                    v = c[b + 88 >> 2] | 0;
                    v = (t | 0) < (v | 0) ? t : v + -1 | 0;
                    t = (c[b + 96 >> 2] | 0) + ($(v, c[b + 112 >> 2] | 0) | 0) | 0;
                    v = (c[b + 100 >> 2] | 0) + ($(c[b + 116 >> 2] | 0, v) | 0) | 0;
                    w = b + 84 | 0;
                    fe(c[b + (u << 2) + 132 >> 2] | 0, t | 0, c[w >> 2] | 0) | 0;
                    fe(c[b + (u << 2) + 164 >> 2] | 0, v | 0, c[w >> 2] | 0) | 0
                }
                Ka[c[b + 248 >> 2] & 7](b + 200 | 0, e, m, c[n >> 2] | 0, c[p >> 2] | 0, f, k)
            } else {
                w = -1;
                i = g;
                return w | 0
            }
            a: do
                if (!(a[b + 31 >> 0] | 0)) {
                    if (a[j >> 0] | 0) {
                        if (!(a[b + 29 >> 0] | 0)) {
                            if ((f | 0) <= 0) break;
                            b = e + 3 | 0;
                            e = 0;
                            while (1) {
                                a[b >> 0] = -1;
                                e = e + 1 | 0;
                                if ((e | 0) == (f | 0)) break a;
                                else b = b + 4 | 0
                            }
                        }
                        j = c[b + 104 >> 2] | 0;
                        k = $(c[b + 120 >> 2] | 0, l) | 0;
                        o = e + 3 | 0;
                        if ((c[b + 240 >> 2] | 0) == 8) {
                            if ((f | 0) > 0) {
                                l = 0;
                                while (1) {
                                    a[o >> 0] = a[j + (l + k) >> 0] | 0;
                                    l = l + 1 | 0;
                                    if ((l | 0) == (f | 0)) break;
                                    else o = o + 4 | 0
                                }
                            }
                        } else {
                            l = c[b + 208 >> 2] | 0;
                            m = c[b + 204 >> 2] | 0;
                            n = c[b + 200 >> 2] | 0;
                            if ((f | 0) > 0) {
                                p = 0;
                                while (1) {
                                    a[o >> 0] = ($(d[j + (p + k) >> 0] | 0, l) | 0) + m >> n;
                                    p = p + 1 | 0;
                                    if ((p | 0) == (f | 0)) break;
                                    else o = o + 4 | 0
                                }
                            }
                        }
                        if (a[b + 33 >> 0] | 0) {
                            if (!(c[1258] | 0)) {
                                c[1258] = 1;
                                b = 1;
                                do {
                                    c[5040 + (b << 2) >> 2] = (((b | 0) / 2 | 0) + 16711808 | 0) / (b | 0) | 0;
                                    b = b + 1 | 0
                                } while ((b | 0) != 256)
                            }
                            if ((f | 0) > 0) {
                                b = 0;
                                while (1) {
                                    k = a[e + 3 >> 0] | 0;
                                    if (!(k << 24 >> 24)) {
                                        a[e >> 0] = -1;
                                        a[e + 1 >> 0] = -1;
                                        a[e + 2 >> 0] = -1
                                    } else {
                                        j = c[5040 + ((k & 255) << 2) >> 2] | 0;
                                        l = a[e >> 0] | 0;
                                        if ((l & 255) < (k & 255)) l = (($(l & 255, j) | 0) + 32768 | 0) >>> 16 & 255;
                                        else l = -1;
                                        a[e >> 0] = l;
                                        l = e + 1 | 0;
                                        m = a[l >> 0] | 0;
                                        if ((m & 255) < (k & 255)) m = (($(m & 255, j) | 0) + 32768 | 0) >>> 16 & 255;
                                        else m = -1;
                                        a[l >> 0] = m;
                                        l = e + 2 | 0;
                                        m = a[l >> 0] | 0;
                                        if ((m & 255) < (k & 255)) j = (($(m & 255, j) | 0) + 32768 | 0) >>> 16 & 255;
                                        else j = -1;
                                        a[l >> 0] = j
                                    }
                                    b = b + 1 | 0;
                                    if ((b | 0) == (f | 0)) break;
                                    else e = e + 4 | 0
                                }
                            }
                        }
                    }
                } else {
                    m = c[b + 104 >> 2] | 0;
                    l = $(c[b + 120 >> 2] | 0, l) | 0;
                    b = c[b + 240 >> 2] | 0;
                    q = 1 << b + -1;
                    p = (f | 0) > 0;
                    if (p) {
                        o = e;
                        n = 0;
                        while (1) {
                            v = d[m + (n + l) >> 0] | 0;
                            a[o >> 0] = ($(d[o >> 0] | 0, v) | 0) + q >> b;
                            w = o + 1 | 0;
                            a[w >> 0] = ($(d[w >> 0] | 0, v) | 0) + q >> b;
                            w = o + 2 | 0;
                            a[w >> 0] = ($(d[w >> 0] | 0, v) | 0) + q >> b;
                            n = n + 1 | 0;
                            if ((n | 0) == (f | 0)) break;
                            else o = o + k | 0
                        }
                    }
                    if (!((a[j >> 0] | 0) == 0 | p ^ 1)) {
                        e = e + 3 | 0;
                        b = 0;
                        while (1) {
                            a[e >> 0] = -1;
                            b = b + 1 | 0;
                            if ((b | 0) == (f | 0)) break;
                            else e = e + 4 | 0
                        }
                    }
                }
            while (0);
            c[h >> 2] = (c[h >> 2] | 0) + 1;
            w = 0;
            i = g;
            return w | 0
        }

        function Hd(e, f, g, h, j, k, l, m) {
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
                B = 0;
            n = i;
            p = c[f + ((h + 5 & 7) << 2) >> 2] | 0;
            t = c[f + ((h + 6 & 7) << 2) >> 2] | 0;
            q = c[f + ((h + 7 & 7) << 2) >> 2] | 0;
            s = c[f + ((h & 7) << 2) >> 2] | 0;
            r = c[f + ((h + 1 & 7) << 2) >> 2] | 0;
            o = c[f + ((h + 2 & 7) << 2) >> 2] | 0;
            f = c[f + ((h + 3 & 7) << 2) >> 2] | 0;
            u = k + -8 | 0;
            v = 1 << u >> 1;
            h = (g + 1 | 0) / 2 | 0;
            w = (g | 0) > 0;
            if (!l) {
                if (w) {
                    l = 0;
                    do {
                        y = $(d[t + l >> 0] | 0, -6) | 0;
                        z = $(d[r + l >> 0] | 0, -10) | 0;
                        b[j + (l + 3 << 1) >> 1] = (d[p + l >> 0] << 1) + v + y + ((d[q + l >> 0] | 0) * 18 | 0) + ((d[s + l >> 0] | 0) * 57 | 0) + z + (d[o + l >> 0] << 2) - (d[f + l >> 0] | 0) >> u;
                        l = l + 1 | 0
                    } while ((l | 0) < (h | 0))
                }
            } else if (w) {
                l = 0;
                do {
                    y = $(d[q + l >> 0] | 0, -10) | 0;
                    z = $(d[o + l >> 0] | 0, -6) | 0;
                    b[j + (l + 3 << 1) >> 1] = v - (d[p + l >> 0] | 0) + (d[t + l >> 0] << 2) + y + ((d[s + l >> 0] | 0) * 57 | 0) + ((d[r + l >> 0] | 0) * 18 | 0) + z + (d[f + l >> 0] << 1) >> u;
                    l = l + 1 | 0
                } while ((l | 0) < (h | 0))
            }
            o = j + 6 | 0;
            z = b[o >> 1] | 0;
            b[j >> 1] = z;
            q = j + 2 | 0;
            b[q >> 1] = z;
            p = j + 4 | 0;
            b[p >> 1] = z;
            z = b[j + (h + 2 << 1) >> 1] | 0;
            b[j + (h + 3 << 1) >> 1] = z;
            b[j + (h + 4 << 1) >> 1] = z;
            b[j + (h + 5 << 1) >> 1] = z;
            b[j + (h + 6 << 1) >> 1] = z;
            h = (1 << k) + -1 | 0;
            if (!m) {
                p = 14 - k | 0;
                m = 1 << p >> 1;
                t = 20 - k | 0;
                s = 1 << t + -1;
                if ((g | 0) > 1) {
                    r = g + -2 | 0;
                    k = r >>> 1;
                    q = k << 1;
                    f = e;
                    while (1) {
                        u = (b[o >> 1] | 0) + m >> p;
                        if ((u | 0) < 0) u = 0;
                        else u = ((u | 0) > (h | 0) ? h : u) & 255;
                        a[f >> 0] = u;
                        z = $((b[o + 4 >> 1] | 0) + (b[o + -2 >> 1] | 0) | 0, -11) | 0;
                        u = o;
                        o = o + 2 | 0;
                        u = s - (b[u + -6 >> 1] | 0) - (b[u + 8 >> 1] | 0) + ((b[u + 6 >> 1] | 0) + (b[u + -4 >> 1] | 0) << 2) + z + (((b[o >> 1] | 0) + (b[u >> 1] | 0) | 0) * 40 | 0) >> t;
                        if ((u | 0) < 0) u = 0;
                        else u = ((u | 0) > (h | 0) ? h : u) & 255;
                        a[f + 1 >> 0] = u;
                        g = g + -2 | 0;
                        if ((g | 0) <= 1) break;
                        else f = f + 2 | 0
                    }
                    e = e + (q + 2) | 0;
                    g = r - q | 0;
                    o = j + (k + 4 << 1) | 0
                }
                if (!g) {
                    i = n;
                    return
                }
                j = (b[o >> 1] | 0) + m >> p;
                if ((j | 0) < 0) j = 0;
                else j = ((j | 0) > (h | 0) ? h : j) & 255;
                a[e >> 0] = j;
                i = n;
                return
            } else {
                k = 20 - k | 0;
                m = 1 << k + -1;
                l = b[j >> 1] | 0;
                v = b[q >> 1] | 0;
                u = b[p >> 1] | 0;
                f = b[o >> 1] | 0;
                s = b[j + 8 >> 1] | 0;
                t = b[j + 10 >> 1] | 0;
                if ((g | 0) > 1) {
                    r = g + -2 | 0;
                    p = r >>> 1;
                    q = p << 1;
                    x = e;
                    while (1) {
                        w = b[o + 6 >> 1] | 0;
                        y = f * 57 | 0;
                        z = (t << 2) + m + ($(s, -10) | 0) + y + (u * 18 | 0) + ($(v, -6) | 0) + (l << 1) - w >> k;
                        if ((z | 0) < 0) z = 0;
                        else z = ((z | 0) > (h | 0) ? h : z) & 255;
                        a[x >> 0] = z;
                        l = ($(t, -6) | 0) + m + (s * 18 | 0) + y + ($(u, -10) | 0) - l + (v << 2) + (w << 1) >> k;
                        if ((l | 0) < 0) l = 0;
                        else l = ((l | 0) > (h | 0) ? h : l) & 255;
                        a[x + 1 >> 0] = l;
                        g = g + -2 | 0;
                        if ((g | 0) <= 1) break;
                        else {
                            B = t;
                            A = s;
                            y = f;
                            z = u;
                            l = v;
                            t = w;
                            x = x + 2 | 0;
                            o = o + 2 | 0;
                            s = B;
                            f = A;
                            u = y;
                            v = z
                        }
                    }
                    l = v;
                    v = u;
                    u = f;
                    f = s;
                    s = t;
                    t = w;
                    e = e + (q + 2) | 0;
                    g = r - q | 0;
                    o = j + (p + 4 << 1) | 0
                }
                if (!g) {
                    i = n;
                    return
                }
                j = (t << 2) + m + ($(s, -10) | 0) + (f * 57 | 0) + (u * 18 | 0) + ($(v, -6) | 0) + (l << 1) - (b[o + 6 >> 1] | 0) >> k;
                if ((j | 0) < 0) j = 0;
                else j = ((j | 0) > (h | 0) ? h : j) & 255;
                a[e >> 0] = j;
                i = n;
                return
            }
        }

        function Id(b, c, e, f, g, h) {
            b = b | 0;
            c = c | 0;
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
                x = 0;
            j = i;
            v = (e + 1 | 0) / 2 | 0;
            k = h + 3 | 0;
            fe(k | 0, c | 0, v | 0) | 0;
            ce(h | 0, a[c >> 0] | 0, 3) | 0;
            ce(h + (v + 3) | 0, a[c + (v + -1) >> 0] | 0, 4) | 0;
            c = (1 << f) + -1 | 0;
            if (!g) {
                if ((e | 0) > 1) {
                    f = e + -2 | 0;
                    g = f >>> 1;
                    l = g << 1;
                    m = b;
                    while (1) {
                        a[m >> 0] = a[k >> 0] | 0;
                        v = $((d[k + 2 >> 0] | 0) + (d[k + -1 >> 0] | 0) | 0, -11) | 0;
                        n = k;
                        k = k + 1 | 0;
                        n = 32 - (d[n + -3 >> 0] | 0) - (d[n + 4 >> 0] | 0) + ((d[n + 3 >> 0] | 0) + (d[n + -2 >> 0] | 0) << 2) + v + (((d[k >> 0] | 0) + (d[n >> 0] | 0) | 0) * 40 | 0) >> 6;
                        if ((n | 0) < 0) n = 0;
                        else n = ((n | 0) > (c | 0) ? c : n) & 255;
                        a[m + 1 >> 0] = n;
                        e = e + -2 | 0;
                        if ((e | 0) <= 1) break;
                        else m = m + 2 | 0
                    }
                    b = b + (l + 2) | 0;
                    e = f - l | 0;
                    k = h + (g + 4) | 0
                }
                if (!e) {
                    i = j;
                    return
                }
                a[b >> 0] = a[k >> 0] | 0;
                i = j;
                return
            }
            q = d[h >> 0] | 0;
            r = d[h + 1 >> 0] | 0;
            m = d[h + 2 >> 0] | 0;
            p = d[k >> 0] | 0;
            o = d[h + 4 >> 0] | 0;
            n = d[h + 5 >> 0] | 0;
            if ((e | 0) > 1) {
                f = e + -2 | 0;
                g = f >>> 1;
                l = g << 1;
                t = b;
                while (1) {
                    s = d[k + 3 >> 0] | 0;
                    u = p * 57 | 0;
                    v = (n << 2) + 32 + ($(o, -10) | 0) + u + (m * 18 | 0) + ($(r, -6) | 0) + (q << 1) - s >> 6;
                    if ((v | 0) < 0) v = 0;
                    else v = ((v | 0) > (c | 0) ? c : v) & 255;
                    a[t >> 0] = v;
                    q = ($(n, -6) | 0) + 32 + (o * 18 | 0) + u + ($(m, -10) | 0) - q + (r << 2) + (s << 1) >> 6;
                    if ((q | 0) < 0) q = 0;
                    else q = ((q | 0) > (c | 0) ? c : q) & 255;
                    a[t + 1 >> 0] = q;
                    e = e + -2 | 0;
                    if ((e | 0) <= 1) break;
                    else {
                        x = n;
                        w = o;
                        u = p;
                        v = m;
                        q = r;
                        n = s;
                        t = t + 2 | 0;
                        k = k + 1 | 0;
                        o = x;
                        p = w;
                        m = u;
                        r = v
                    }
                }
                q = r;
                r = m;
                m = p;
                p = o;
                o = n;
                n = s;
                b = b + (l + 2) | 0;
                e = f - l | 0;
                k = h + (g + 4) | 0
            }
            if (!e) {
                i = j;
                return
            }
            h = (n << 2) + 32 + ($(o, -10) | 0) + (p * 57 | 0) + (m * 18 | 0) + ($(r, -6) | 0) + (q << 1) - (d[k + 3 >> 0] | 0) >> 6;
            if ((h | 0) < 0) h = 0;
            else h = ((h | 0) > (c | 0) ? c : h) & 255;
            a[b >> 0] = h;
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
            if ((x | 0) == 5) {
                c[C >> 2] = 2;
                a[e + 28 >> 0] = 0;
                x = 2
            } else if ((x | 0) == 4) {
                c[C >> 2] = 1;
                a[e + 28 >> 0] = 0;
                x = 1
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

        function Rd(b, e, f, g, h, j, k) {
            b = b | 0;
            e = e | 0;
            f = f | 0;
            g = g | 0;
            h = h | 0;
            j = j | 0;
            k = k | 0;
            var l = 0,
                m = 0,
                n = 0;
            h = i;
            if ((c[b + 40 >> 2] | 0) == 8 ? (c[b + 44 >> 2] | 0) == 0 : 0) {
                if ((j | 0) > 0) g = 0;
                else {
                    i = h;
                    return
                }
                while (1) {
                    n = a[f + g >> 0] | 0;
                    a[e >> 0] = n;
                    a[e + 1 >> 0] = n;
                    a[e + 2 >> 0] = n;
                    g = g + 1 | 0;
                    if ((g | 0) == (j | 0)) break;
                    else e = e + k | 0
                }
                i = h;
                return
            }
            l = c[b + 12 >> 2] | 0;
            g = c[b + 16 >> 2] | 0;
            b = c[b >> 2] | 0;
            if ((j | 0) > 0) m = 0;
            else {
                i = h;
                return
            }
            while (1) {
                n = ($(d[f + m >> 0] | 0, l) | 0) + g >> b;
                if ((n | 0) < 0) n = 0;
                else n = (n | 0) > 255 ? -1 : n & 255;
                a[e >> 0] = n;
                a[e + 1 >> 0] = n;
                a[e + 2 >> 0] = n;
                m = m + 1 | 0;
                if ((m | 0) == (j | 0)) break;
                else e = e + k | 0
            }
            i = h;
            return
        }

        function Sd(b, e, f, g, h, j, k) {
            b = b | 0;
            e = e | 0;
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
                v = $(d[f + t >> 0] | 0, p) | 0;
                u = (d[g + t >> 0] | 0) - b | 0;
                w = (d[h + t >> 0] | 0) - b | 0;
                v = v + r | 0;
                x = v + ($(w, s) | 0) >> m;
                if ((x | 0) < 0) x = 0;
                else x = (x | 0) > 255 ? -1 : x & 255;
                a[e >> 0] = x;
                w = v - ($(u, n) | 0) - ($(w, o) | 0) >> m;
                if ((w | 0) < 0) w = 0;
                else w = (w | 0) > 255 ? -1 : w & 255;
                a[e + 1 >> 0] = w;
                u = v + ($(u, l) | 0) >> m;
                if ((u | 0) < 0) u = 0;
                else u = (u | 0) > 255 ? -1 : u & 255;
                a[e + 2 >> 0] = u;
                t = t + 1 | 0;
                if ((t | 0) == (j | 0)) break;
                else e = e + k | 0
            }
            i = q;
            return
        }

        function Td(b, e, f, g, h, j, k) {
            b = b | 0;
            e = e | 0;
            f = f | 0;
            g = g | 0;
            h = h | 0;
            j = j | 0;
            k = k | 0;
            var l = 0,
                m = 0,
                n = 0,
                o = 0,
                p = 0;
            l = i;
            if ((c[b + 40 >> 2] | 0) == 8 ? (c[b + 44 >> 2] | 0) == 0 : 0) {
                if ((j | 0) > 0) m = 0;
                else {
                    i = l;
                    return
                }
                while (1) {
                    a[e >> 0] = a[h + m >> 0] | 0;
                    a[e + 1 >> 0] = a[f + m >> 0] | 0;
                    a[e + 2 >> 0] = a[g + m >> 0] | 0;
                    m = m + 1 | 0;
                    if ((m | 0) == (j | 0)) break;
                    else e = e + k | 0
                }
                i = l;
                return
            }
            n = c[b + 12 >> 2] | 0;
            m = c[b + 16 >> 2] | 0;
            b = c[b >> 2] | 0;
            if ((j | 0) > 0) o = 0;
            else {
                i = l;
                return
            }
            while (1) {
                p = ($(d[h + o >> 0] | 0, n) | 0) + m >> b;
                if ((p | 0) < 0) p = 0;
                else p = (p | 0) > 255 ? -1 : p & 255;
                a[e >> 0] = p;
                p = ($(d[f + o >> 0] | 0, n) | 0) + m >> b;
                if ((p | 0) < 0) p = 0;
                else p = (p | 0) > 255 ? -1 : p & 255;
                a[e + 1 >> 0] = p;
                p = ($(d[g + o >> 0] | 0, n) | 0) + m >> b;
                if ((p | 0) < 0) p = 0;
                else p = (p | 0) > 255 ? -1 : p & 255;
                a[e + 2 >> 0] = p;
                o = o + 1 | 0;
                if ((o | 0) == (j | 0)) break;
                else e = e + k | 0
            }
            i = l;
            return
        }

        function Ud(b, e, f, g, h, j, k) {
            b = b | 0;
            e = e | 0;
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
                t = d[f + p >> 0] | 0;
                s = (d[g + p >> 0] | 0) - b | 0;
                r = (d[h + p >> 0] | 0) - b | 0;
                q = t - s | 0;
                u = ($(q + r | 0, l) | 0) + m >> n;
                if ((u | 0) < 0) u = 0;
                else u = (u | 0) > 255 ? -1 : u & 255;
                a[e >> 0] = u;
                s = ($(s + t | 0, l) | 0) + m >> n;
                if ((s | 0) < 0) s = 0;
                else s = (s | 0) > 255 ? -1 : s & 255;
                a[e + 1 >> 0] = s;
                q = ($(q - r | 0, l) | 0) + m >> n;
                if ((q | 0) < 0) q = 0;
                else q = (q | 0) > 255 ? -1 : q & 255;
                a[e + 2 >> 0] = q;
                p = p + 1 | 0;
                if ((p | 0) == (j | 0)) break;
                else e = e + k | 0
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

        function me(a, b, c, d, e, f) {
            a = a | 0;
            b = b | 0;
            c = c | 0;
            d = d | 0;
            e = e | 0;
            f = f | 0;
            ya[a & 3](b | 0, c | 0, d | 0, e | 0, f | 0)
        }

        function ne(a, b) {
            a = a | 0;
            b = b | 0;
            za[a & 7](b | 0)
        }

        function oe(a, b, c) {
            a = a | 0;
            b = b | 0;
            c = c | 0;
            Aa[a & 7](b | 0, c | 0)
        }

        function pe(a, b, c, d, e, f, g) {
            a = a | 0;
            b = b | 0;
            c = c | 0;
            d = d | 0;
            e = e | 0;
            f = f | 0;
            g = g | 0;
            return Ba[a & 1](b | 0, c | 0, d | 0, e | 0, f | 0, g | 0) | 0
        }

        function qe(a, b, c, d, e, f, g, h, i, j, k, l, m) {
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
            Ca[a & 3](b | 0, c | 0, d | 0, e | 0, f | 0, g | 0, h | 0, i | 0, j | 0, k | 0, l | 0, m | 0)
        }

        function re(a, b) {
            a = a | 0;
            b = b | 0;
            return Da[a & 3](b | 0) | 0
        }

        function se(a, b, c, d) {
            a = a | 0;
            b = b | 0;
            c = c | 0;
            d = d | 0;
            Ea[a & 7](b | 0, c | 0, d | 0)
        }

        function te(a, b, c, d, e, f, g, h, i, j) {
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
            Fa[a & 1](b | 0, c | 0, d | 0, e | 0, f | 0, g | 0, h | 0, i | 0, j | 0)
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

        function ye(a, b, c, d, e, f, g, h) {
            a = a | 0;
            b = b | 0;
            c = c | 0;
            d = d | 0;
            e = e | 0;
            f = f | 0;
            g = g | 0;
            h = h | 0;
            Ka[a & 7](b | 0, c | 0, d | 0, e | 0, f | 0, g | 0, h | 0)
        }

        function ze(a, b, c) {
            a = a | 0;
            b = b | 0;
            c = c | 0;
            aa(0);
            return 0
        }

        function Ae(a, b, c, d, e) {
            a = a | 0;
            b = b | 0;
            c = c | 0;
            d = d | 0;
            e = e | 0;
            aa(1)
        }

        function Be(a) {
            a = a | 0;
            aa(2)
        }

        function Ce(a, b) {
            a = a | 0;
            b = b | 0;
            aa(3)
        }

        function De(a, b, c, d, e, f) {
            a = a | 0;
            b = b | 0;
            c = c | 0;
            d = d | 0;
            e = e | 0;
            f = f | 0;
            aa(4);
            return 0
        }

        function Ee(a, b, c, d, e, f, g, h, i, j, k, l) {
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
            aa(5)
        }

        function Fe(a) {
            a = a | 0;
            aa(6);
            return 0
        }

        function Ge(a, b, c) {
            a = a | 0;
            b = b | 0;
            c = c | 0;
            aa(7)
        }

        function He(a, b, c, d, e, f, g, h, i) {
            a = a | 0;
            b = b | 0;
            c = c | 0;
            d = d | 0;
            e = e | 0;
            f = f | 0;
            g = g | 0;
            h = h | 0;
            i = i | 0;
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

        function Me(a, b, c, d, e, f, g) {
            a = a | 0;
            b = b | 0;
            c = c | 0;
            d = d | 0;
            e = e | 0;
            f = f | 0;
            g = g | 0;
            aa(13)
        }

        // EMSCRIPTEN_END_FUNCS
        var xa = [ze, Mc];
        var ya = [Ae, xc, yc, Ae];
        var za = [Be, Mb, jc, oc, pc, qc, rc, Be];
        var Aa = [Ce, hc, kc, lc, mc, nc, Fc, rd];
        var Ba = [De, Kc];
        var Ca = [Ee, tc, uc, Ee];
        var Da = [Fe, Jb, Lb, Fe];
        var Ea = [Ge, dc, ec, fc, gc, ic, Ge, Ge];
        var Fa = [He, sc];
        var Ga = [Ie, Kb];
        var Ha = [Je, cc, vc, wc];
        var Ia = [Ke, Pb];
        var Ja = [Le, Lc];
        var Ka = [Me, Sd, Td, Ud, Rd, Me, Me, Me];
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
            dynCall_viiiii: me,
            dynCall_vi: ne,
            dynCall_vii: oe,
            dynCall_iiiiiii: pe,
            dynCall_viiiiiiiiiiii: qe,
            dynCall_ii: re,
            dynCall_viii: se,
            dynCall_viiiiiiiii: te,
            dynCall_iiiii: ue,
            dynCall_viiiiii: ve,
            dynCall_iii: we,
            dynCall_iiiiii: xe,
            dynCall_viiiiiii: ye
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
    var dynCall_viiiii = Module["dynCall_viiiii"] = asm["dynCall_viiiii"];
    var dynCall_vi = Module["dynCall_vi"] = asm["dynCall_vi"];
    var dynCall_vii = Module["dynCall_vii"] = asm["dynCall_vii"];
    var dynCall_iiiiiii = Module["dynCall_iiiiiii"] = asm["dynCall_iiiiiii"];
    var dynCall_viiiiiiiiiiii = Module["dynCall_viiiiiiiiiiii"] = asm["dynCall_viiiiiiiiiiii"];
    var dynCall_ii = Module["dynCall_ii"] = asm["dynCall_ii"];
    var dynCall_viii = Module["dynCall_viii"] = asm["dynCall_viii"];
    var dynCall_viiiiiiiii = Module["dynCall_viiiiiiiii"] = asm["dynCall_viiiiiiiii"];
    var dynCall_iiiii = Module["dynCall_iiiii"] = asm["dynCall_iiiii"];
    var dynCall_viiiiii = Module["dynCall_viiiiii"] = asm["dynCall_viiiiii"];
    var dynCall_iii = Module["dynCall_iii"] = asm["dynCall_iii"];
    var dynCall_iiiiii = Module["dynCall_iiiiii"] = asm["dynCall_iiiiii"];
    var dynCall_viiiiiii = Module["dynCall_viiiiiii"] = asm["dynCall_viiiiiii"];
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
    return BPGDecoder
})()
