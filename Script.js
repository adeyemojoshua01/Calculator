(function() {
    // ============ STATE ============
    const state = {
        display: '0',
        stack: [0, 0, 0, 0],
        currentInput: '',
        pendingOperator: null,
        pendingOperand: null,
        shouldResetDisplay: false,
        shiftG: false,
        shiftB: false,
        lastResult: null,
        memory: 0,
        rpnMode: false,
        angleMode: 'DEG', // 'DEG', 'RAD', 'GRAD'
        history: [],
    };

    const displayEl = document.getElementById('display');
    const stackPreviewEl = document.getElementById('stackPreview');
    const calculatorEl = document.getElementById('calculator');
    const keypadEl = document.getElementById('keypad');
    const annShiftG = document.getElementById('annShiftG');
    const annShiftB = document.getElementById('annShiftB');
    const annAngle = document.getElementById('annAngle');
    const annRPN = document.getElementById('annRPN');
    const annMEM = document.getElementById('annMEM');
    const powerIndicator = document.getElementById('powerIndicator');

    let audioCtx = null;

    function playClick(freq = 2800, duration = 0.03, vol = 0.04) {
        try {
            if (!audioCtx) audioCtx = new(window.AudioContext || window.webkitAudioContext)();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(freq * 0.6, audioCtx.currentTime + duration);
            gain.gain.setValueAtTime(vol, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(audioCtx.currentTime);
            osc.stop(audioCtx.currentTime + duration);
        } catch (e) {}
    }

    function playOperatorClick() { playClick(3200, 0.04, 0.05); }
    function playEqualsClick() { playClick(2200, 0.06, 0.07); }
    function playShiftClick() { playClick(1800, 0.03, 0.03); }

    function updateDisplay() {
        let displayValue = state.display;
        if (!isNaN(parseFloat(displayValue)) && isFinite(displayValue) && !displayValue.includes('e') && !displayValue.includes('Error')) {
            const num = parseFloat(displayValue);
            if (Math.abs(num) >= 1e12 || (Math.abs(num) < 0.0001 && num !== 0)) {
                displayValue = num.toExponential(8);
            } else {
                const parts = displayValue.split('.');
                const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, "'");
                displayValue = parts.length > 1 ? intPart + '.' + parts[1] : intPart;
            }
        }
        displayEl.textContent = displayValue;
        displayEl.classList.remove('smaller', 'even-smaller');
        if (displayValue.length > 14) displayEl.classList.add('even-smaller');
        else if (displayValue.length > 10) displayEl.classList.add('smaller');

        if (state.rpnMode && state.stack.length > 1) {
            const yVal = state.stack[1];
            let yStr = (typeof yVal === 'number' && isFinite(yVal)) ? (Number.isInteger(yVal) ? yVal.toString() : parseFloat(yVal.toPrecision(10)).toString()) : '';
            stackPreviewEl.textContent = 'Y: ' + yStr;
            stackPreviewEl.classList.add('visible');
        } else {
            stackPreviewEl.classList.remove('visible');
        }
    }

    function updateAnnunciators() {
        annShiftG.classList.toggle('shift-gold-active', state.shiftG);
        annShiftG.classList.toggle('active', state.shiftG);
        annShiftB.classList.toggle('shift-blue-active', state.shiftB);
        annShiftB.classList.toggle('active', state.shiftB);
        annAngle.textContent = state.angleMode;
        annAngle.classList.toggle('active', true);
        annRPN.classList.toggle('active', state.rpnMode);
        annMEM.classList.toggle('active', state.memory !== 0);
    }

    function updateShiftModeClasses() {
        calculatorEl.classList.toggle('shift-gold-mode', state.shiftG);
        calculatorEl.classList.toggle('shift-blue-mode', state.shiftB);
    }

    function refreshUI() {
        updateDisplay();
        updateAnnunciators();
        updateShiftModeClasses();
    }

    // ============ CORE MATH ============
    function toRadians(angle) {
        switch (state.angleMode) {
            case 'DEG': return angle * Math.PI / 180;
            case 'GRAD': return angle * Math.PI / 200;
            default: return angle;
        }
    }

    function fromRadians(rad) {
        switch (state.angleMode) {
            case 'DEG': return rad * 180 / Math.PI;
            case 'GRAD': return rad * 200 / Math.PI;
            default: return rad;
        }
    }

    function formatResult(value) {
        if (!isFinite(value)) return 'Error';
        if (Math.abs(value) > 1e12 || (Math.abs(value) < 1e-10 && value !== 0)) return value.toExponential(10);
        const str = parseFloat(value.toPrecision(12)).toString();
        return str.length > 16 ? value.toExponential(10) : str;
    }

    function getCurrentNumber() {
        return parseFloat(state.currentInput || state.display) || 0;
    }

    function pushStack(value) {
        state.stack.unshift(value);
        if (state.stack.length > 4) state.stack.pop();
    }

    function popStack() {
        const val = state.stack[0];
        state.stack.shift();
        state.stack.push(0);
        return val;
    }

    function calculate(a, b, operator) {
        switch (operator) {
            case 'add': return a + b;
            case 'subtract': return a - b;
            case 'multiply': return a * b;
            case 'divide': return b !== 0 ? a / b : NaN;
            default: return b;
        }
    }

    // ============ ACTIONS ============
    function clearAll() {
        state.display = '0';
        state.currentInput = '';
        state.pendingOperator = null;
        state.pendingOperand = null;
        state.shouldResetDisplay = false;
        state.shiftG = false;
        state.shiftB = false;
        if (!state.rpnMode) state.stack = [0, 0, 0, 0];
        refreshUI();
    }

    function inputDigit(digit) {
        if (state.shouldResetDisplay) {
            state.currentInput = '';
            state.shouldResetDisplay = false;
        }
        if (state.currentInput === '0' && digit === '0') return;
        if (state.currentInput === '0' && digit !== '.') state.currentInput = digit;
        else if (state.currentInput.length < 16) state.currentInput += digit;
        state.display = state.currentInput || '0';
        refreshUI();
    }

    function inputDecimal() {
        if (state.shouldResetDisplay) {
            state.currentInput = '0';
            state.shouldResetDisplay = false;
        }
        if (!state.currentInput.includes('.')) {
            state.currentInput = state.currentInput || '0';
            state.currentInput += '.';
            state.display = state.currentInput;
        }
        refreshUI();
    }

    function performOperation(operator) {
        const current = getCurrentNumber();
        if (state.pendingOperator && !state.shouldResetDisplay) {
            const result = calculate(state.pendingOperand, current, state.pendingOperator);
            state.display = formatResult(result);
            state.pendingOperand = result;
        } else {
            state.pendingOperand = current;
        }
        state.pendingOperator = operator;
        state.shouldResetDisplay = true;
        state.currentInput = '';
        clearShifts();
        refreshUI();
    }

    function executeEquals() {
        const current = getCurrentNumber();
        if (state.pendingOperator) {
            const result = calculate(state.pendingOperand, current, state.pendingOperator);
            state.display = formatResult(result);
            state.lastResult = result;
            state.pendingOperand = null;
            state.pendingOperator = null;
        } else {
            state.lastResult = current;
        }
        state.shouldResetDisplay = true;
        state.currentInput = '';
        clearShifts();
        refreshUI();
    }

    function executeRPNEnter() {
        const current = getCurrentNumber();
        pushStack(current);
        state.display = formatResult(current);
        state.currentInput = '';
        state.shouldResetDisplay = true;
        state.lastResult = current;
        state.pendingOperator = null;
        state.pendingOperand = null;
        refreshUI();
    }

    function executeRPNOperation(operator) {
        if (state.stack.length < 2) return;
        const b = state.stack[0];
        const a = state.stack[1];
        let result = calculate(a, b, operator);
        state.stack.shift();
        state.stack[0] = result;
        state.display = formatResult(result);
        state.lastResult = result;
        state.shouldResetDisplay = true;
        state.currentInput = '';
        refreshUI();
    }

    function executeScientific(func) {
        let current = state.rpnMode ? state.stack[0] : getCurrentNumber();
        let result;

        switch (func) {
            case 'sqrt':   result = current >= 0 ? Math.sqrt(current) : NaN; break;
            case 'square': result = current * current; break;
            case 'factorial': result = factorial(current); break;
            case 'log':    result = current > 0 ? Math.log10(current) : NaN; break;
            case 'ln':     result = current > 0 ? Math.log(current) : NaN; break;
            case '10x':    result = Math.pow(10, current); break;
            case 'exp':    result = Math.exp(current); break;
            case 'power':
                if (state.rpnMode && state.stack.length >= 2) {
                    const y = state.stack[0];
                    const x = state.stack[1];
                    result = Math.pow(x, y);
                    state.stack.shift();
                    state.stack[0] = result;
                } else {
                    state.pendingOperator = 'power';
                    state.pendingOperand = current;
                    state.shouldResetDisplay = true;
                    state.currentInput = '';
                    refreshUI();
                    return;
                }
                break;
            case 'xroot':
                if (state.rpnMode && state.stack.length >= 2) {
                    const y = state.stack[0];
                    const x = state.stack[1];
                    result = Math.pow(x, 1 / y);
                    state.stack.shift();
                    state.stack[0] = result;
                } else {
                    state.pendingOperator = 'xroot';
                    state.pendingOperand = current;
                    state.shouldResetDisplay = true;
                    state.currentInput = '';
                    refreshUI();
                    return;
                }
                break;
            case 'reciprocal': result = current !== 0 ? 1 / current : NaN; break;
            case 'sin':   result = Math.sin(toRadians(current)); break;
            case 'cos':   result = Math.cos(toRadians(current)); break;
            case 'tan':   result = Math.tan(toRadians(current)); break;
            case 'asin':  result = fromRadians(Math.asin(current)); break;
            case 'acos':  result = fromRadians(Math.acos(current)); break;
            case 'atan':  result = fromRadians(Math.atan(current)); break;
            case 'pi':    result = Math.PI; break;
            case 'negate': result = -current; break;
            default: result = current;
        }

        if (func !== 'power' && func !== 'xroot') {
            state.display = formatResult(result);
            state.lastResult = result;
            if (state.rpnMode && state.stack.length > 0) state.stack[0] = result;
            state.shouldResetDisplay = true;
            state.currentInput = '';
        }
        clearShifts();
        refreshUI();
    }

    function factorial(n) {
        if (n < 0 || !Number.isInteger(n)) return NaN;
        if (n === 0 || n === 1) return 1;
        let res = 1;
        for (let i = 2; i <= n; i++) res *= i;
        return res > 1e308 ? Infinity : res;
    }

    function executePendingPower() {
        const current = getCurrentNumber();
        const op = state.pendingOperator;
        if (op === 'power' && state.pendingOperand !== null) {
            const result = Math.pow(state.pendingOperand, current);
            state.display = formatResult(result);
            state.lastResult = result;
            if (state.rpnMode) state.stack[0] = result;
        } else if (op === 'xroot' && state.pendingOperand !== null) {
            const result = Math.pow(state.pendingOperand, 1 / current);
            state.display = formatResult(result);
            state.lastResult = result;
            if (state.rpnMode) state.stack[0] = result;
        }
        state.pendingOperator = null;
        state.pendingOperand = null;
        state.shouldResetDisplay = true;
        state.currentInput = '';
        refreshUI();
    }

    function executeMemory(op) {
        const current = getCurrentNumber();
        if (op === 'store') {
            state.memory = current;
        } else if (op === 'recall') {
            state.display = formatResult(state.memory);
            state.currentInput = state.display;
            state.shouldResetDisplay = true;
        }
        refreshUI();
    }

    function clearShifts() {
        state.shiftG = false;
        state.shiftB = false;
    }

    function cycleAngleMode() {
        const modes = ['DEG', 'RAD', 'GRAD'];
        const idx = modes.indexOf(state.angleMode);
        state.angleMode = modes[(idx + 1) % 3];
        refreshUI();
    }

    function toggleRPN() {
        state.rpnMode = !state.rpnMode;
        clearAll();
        refreshUI();
    }

    function clearMemory() {
        state.memory = 0;
        refreshUI();
    }

    // ============ EVENT HANDLING ============
    function handleAction(action, value, shiftG, shiftB) {
        let effectiveAction = action;
        if (shiftG) {
            if (action === 'square') effectiveAction = 'sqrt';
            else if (action === 'log') effectiveAction = 'ln';
            else if (action === 'power') effectiveAction = 'xroot';
            else if (action === 'sin') effectiveAction = 'asin';
            else if (action === 'cos') effectiveAction = 'acos';
            else if (action === 'tan') effectiveAction = 'atan';
            else if (action === 'pi') effectiveAction = 'pi';
            else if (action === 'store') effectiveAction = 'store';
            else if (action === 'recall') effectiveAction = 'recall';
        }
        if (shiftB && !shiftG) {
            if (action === 'square') effectiveAction = 'factorial';
            else if (action === 'log') effectiveAction = '10x';
            else if (action === 'power') effectiveAction = 'reciprocal';
            else if (action === 'exp') effectiveAction = '10x';
            else if (action === 'pi') effectiveAction = 'factorial';
        }

        if (action === 'shiftG') {
            state.shiftG = !state.shiftG;
            state.shiftB = false;
            playShiftClick();
            refreshUI();
            return;
        }
        if (action === 'shiftB') {
            state.shiftB = !state.shiftB;
            state.shiftG = false;
            playShiftClick();
            refreshUI();
            return;
        }

        clearShifts();

        switch (effectiveAction) {
            case 'digit':
                playClick(3000, 0.025, 0.04);
                inputDigit(value);
                break;
            case 'decimal':
                playClick(3000, 0.025, 0.04);
                inputDecimal();
                break;
            case 'add':
            case 'subtract':
            case 'multiply':
            case 'divide':
                playOperatorClick();
                if (state.rpnMode && !state.shouldResetDisplay) executeRPNEnter();
                if (state.rpnMode) executeRPNOperation(effectiveAction);
                else performOperation(effectiveAction);
                break;
            case 'equals':
                playEqualsClick();
                if (state.pendingOperator === 'power' || state.pendingOperator === 'xroot') {
                    executePendingPower();
                } else if (state.rpnMode) {
                    executeRPNEnter();
                } else {
                    executeEquals();
                }
                break;
            case 'enter':
                playOperatorClick();
                executeRPNEnter();
                break;
            case 'clear':
                playClick(1500, 0.04, 0.04);
                clearAll();
                break;
            case 'backspace':
                playClick(2000, 0.025, 0.03);
                if (state.currentInput.length > 0) {
                    state.currentInput = state.currentInput.slice(0, -1);
                    state.display = state.currentInput || '0';
                } else if (!state.shouldResetDisplay) {
                    state.display = '0';
                }
                refreshUI();
                break;
            case 'sqrt':
            case 'square':
            case 'factorial':
            case 'log':
            case 'ln':
            case '10x':
            case 'exp':
            case 'power':
            case 'xroot':
            case 'reciprocal':
            case 'sin':
            case 'cos':
            case 'tan':
            case 'asin':
            case 'acos':
            case 'atan':
            case 'pi':
            case 'negate':
                playClick(2600, 0.03, 0.04);
                executeScientific(effectiveAction);
                break;
            case 'store':
            case 'recall':
                playClick(2600, 0.03, 0.04);
                executeMemory(effectiveAction);
                break;
            default:
                playClick(2800, 0.025, 0.04);
        }
        refreshUI();
    }

    keypadEl.addEventListener('click', (e) => {
        const key = e.target.closest('.key');
        if (!key) return;
        const action = key.dataset.action;
        const value = key.dataset.value;
        key.classList.add('pressed');
        setTimeout(() => key.classList.remove('pressed'), 100);
        handleAction(action, value, state.shiftG, state.shiftB);
    });

    // Annunciator clicks
    annAngle.addEventListener('click', cycleAngleMode);
    annRPN.addEventListener('click', toggleRPN);
    annMEM.addEventListener('click', clearMemory);

    // Keyboard support
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        let action, value;
        const key = e.key;
        if (key >= '0' && key <= '9') { action = 'digit'; value = key; }
        else if (key === '.') { action = 'decimal'; }
        else if (key === '+') { action = 'add'; }
        else if (key === '-') { action = 'subtract'; }
        else if (key === '*') { action = 'multiply'; }
        else if (key === '/') { action = 'divide'; e.preventDefault(); }
        else if (key === 'Enter' || key === '=') { action = state.rpnMode ? 'enter' : 'equals'; }
        else if (key === 'Escape') { action = 'clear'; }
        else if (key === 'Backspace') { action = 'backspace'; }
        else if (key === 's' && e.ctrlKey) { e.preventDefault(); action = 'sin'; }
        else if (key === 'c' && e.ctrlKey) { e.preventDefault(); action = 'cos'; }
        else if (key === 't' && e.ctrlKey) { e.preventDefault(); action = 'tan'; }
        else if (key === 'p' && e.ctrlKey) { e.preventDefault(); action = 'pi'; }
        else if (key === 'r' && e.ctrlKey && e.shiftKey) { e.preventDefault(); toggleRPN(); return; }
        else if (key === 'a' && e.ctrlKey && e.shiftKey) { e.preventDefault(); cycleAngleMode(); return; }
        if (action) { e.preventDefault(); handleAction(action, value, state.shiftG, state.shiftB); }
    });

    powerIndicator.style.opacity = '0.8';
    setInterval(() => {
        powerIndicator.style.opacity = powerIndicator.style.opacity === '0.8' ? '0.3' : '0.8';
    }, 2000);

    refreshUI();
    console.log('PrecisionCalc PRO-X Ready — DEG/RAD/GRAD active');
})();
