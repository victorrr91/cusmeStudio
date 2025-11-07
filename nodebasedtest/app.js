// Node-Based Editor - 바닐라 JavaScript 구현

class NodeEditor {
    constructor() {
        this.nodes = [];
        this.connections = [];
        this.selectedNode = null;
        this.dragging = false;
        this.connecting = false;
        this.connectionStart = null;
        this.nodeIdCounter = 0;
        this.connectionIdCounter = 0;
        
        this.canvas = document.getElementById('canvas');
        this.nodeContainer = document.getElementById('nodeContainer');
        this.outputDiv = document.getElementById('output');
        
        this.resizeCanvas();
        this.setupEventListeners();
        this.setupButtons();
        this.startAnimation();
    }
    
    resizeCanvas() {
        const rect = this.nodeContainer.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
    }
    
    setupEventListeners() {
        window.addEventListener('resize', () => this.resizeCanvas());
        
        this.nodeContainer.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('pin-connector')) {
                this.startConnection(e);
            } else if (e.target.closest('.node')) {
                this.selectNode(e.target.closest('.node'));
            } else {
                this.deselectAll();
            }
        });
        
        this.nodeContainer.addEventListener('mousemove', (e) => {
            if (this.dragging && this.selectedNode) {
                this.updateNodePosition(e);
            }
            if (this.connecting) {
                this.updateConnectionPreview(e);
            }
        });
        
        this.nodeContainer.addEventListener('mouseup', (e) => {
            if (this.connecting) {
                this.endConnection(e);
            }
            this.dragging = false;
        });
        
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Delete' && this.selectedNode) {
                this.deleteNode(this.selectedNode);
            }
        });
    }
    
    setupButtons() {
        document.getElementById('addNumberNode').addEventListener('click', () => {
            this.addNode('number', { value: 0 });
        });
        
        document.getElementById('addMathNode').addEventListener('click', () => {
            this.addNode('math', { operation: 'add' });
        });
        
        document.getElementById('addStringNode').addEventListener('click', () => {
            this.addNode('string', { value: 'Hello' });
        });
        
        document.getElementById('addPrintNode').addEventListener('click', () => {
            this.addNode('print');
        });
        
        document.getElementById('runGraph').addEventListener('click', () => {
            this.executeGraph();
        });
        
        document.getElementById('clearAll').addEventListener('click', () => {
            this.clearAll();
        });
    }
    
    addNode(type, config = {}) {
        const node = new Node(this.nodeIdCounter++, type, config);
        const rect = this.nodeContainer.getBoundingClientRect();
        node.element.style.left = (rect.width / 2 - 100) + 'px';
        node.element.style.top = (rect.height / 2 - 50) + 'px';
        
        this.nodeContainer.appendChild(node.element);
        this.nodes.push(node);
        
        // 노드 인스턴스 참조 설정
        node.element.__node = node;
        
        this.setupNodeDrag(node);
        this.updateConnections();
    }
    
    setupNodeDrag(node) {
        const header = node.element.querySelector('.node-header');
        
        header.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            this.selectNode(node.element);
            this.dragging = true;
            const rect = node.element.getBoundingClientRect();
            const containerRect = this.nodeContainer.getBoundingClientRect();
            node.dragOffsetX = e.clientX - rect.left - containerRect.left;
            node.dragOffsetY = e.clientY - rect.top - containerRect.top;
        });
    }
    
    selectNode(nodeElement) {
        this.deselectAll();
        this.selectedNode = nodeElement;
        nodeElement.classList.add('selected');
    }
    
    deselectAll() {
        this.nodes.forEach(node => {
            node.element.classList.remove('selected');
        });
        this.selectedNode = null;
    }
    
    updateNodePosition(e) {
        if (!this.selectedNode) return;
        
        const node = this.nodes.find(n => n.element === this.selectedNode);
        if (!node) return;
        
        const rect = this.nodeContainer.getBoundingClientRect();
        const x = e.clientX - rect.left - node.dragOffsetX;
        const y = e.clientY - rect.top - node.dragOffsetY;
        
        const nodeRect = node.element.getBoundingClientRect();
        node.element.style.left = Math.max(0, Math.min(x, rect.width - nodeRect.width)) + 'px';
        node.element.style.top = Math.max(0, Math.min(y, rect.height - nodeRect.height)) + 'px';
        
        node.updatePosition();
        this.updateConnections();
    }
    
    startConnection(e) {
        e.stopPropagation();
        this.connecting = true;
        const pin = e.target;
        const nodeElement = pin.closest('.node');
        const node = this.nodes.find(n => n.element === nodeElement);
        const pinType = pin.closest('.pin').classList.contains('input') ? 'input' : 'output';
        const pinIndex = Array.from(pin.closest('.node').querySelectorAll(`.pin.${pinType} .pin-connector`)).indexOf(pin);
        
        this.connectionStart = { node, pinType, pinIndex, pin };
        pin.classList.add('connected');
    }
    
    updateConnectionPreview(e) {
        this.drawConnections();
        
        if (this.connectionStart) {
            const ctx = this.canvas.getContext('2d');
            const startPos = this.connectionStart.pin.getBoundingClientRect();
            const rect = this.nodeContainer.getBoundingClientRect();
            
            const x1 = startPos.left + startPos.width / 2 - rect.left;
            const y1 = startPos.top + startPos.height / 2 - rect.top;
            const x2 = e.clientX - rect.left;
            const y2 = e.clientY - rect.top;
            
            this.drawConnection(ctx, x1, y1, x2, y2);
        }
    }
    
    endConnection(e) {
        if (!this.connecting || !this.connectionStart) {
            this.connecting = false;
            this.connectionStart = null;
            return;
        }
        
        const target = e.target;
        if (target.classList.contains('pin-connector')) {
            const nodeElement = target.closest('.node');
            const targetNode = this.nodes.find(n => n.element === nodeElement);
            const targetPinType = target.closest('.pin').classList.contains('input') ? 'input' : 'output';
            const targetPinIndex = Array.from(nodeElement.querySelectorAll(`.pin.${targetPinType} .pin-connector`)).indexOf(target);
            
            if (targetNode && 
                this.connectionStart.node !== targetNode &&
                this.connectionStart.pinType !== targetPinType) {
                
                const fromNode = this.connectionStart.pinType === 'output' ? this.connectionStart.node : targetNode;
                const toNode = this.connectionStart.pinType === 'output' ? targetNode : this.connectionStart.node;
                const fromPin = this.connectionStart.pinType === 'output' ? this.connectionStart.pinIndex : targetPinIndex;
                const toPin = this.connectionStart.pinType === 'output' ? targetPinIndex : this.connectionStart.pinIndex;
                
                this.createConnection(fromNode, fromPin, toNode, toPin);
            }
        }
        
        if (this.connectionStart) {
            this.connectionStart.pin.classList.remove('connected');
        }
        
        this.connecting = false;
        this.connectionStart = null;
        this.updateConnections();
    }
    
    createConnection(fromNode, fromPin, toNode, toPin) {
        // 중복 연결 체크
        const exists = this.connections.some(conn => 
            conn.fromNode === fromNode && 
            conn.fromPin === fromPin &&
            conn.toNode === toNode &&
            conn.toPin === toPin
        );
        
        if (exists) return;
        
        // 입력 핀에 이미 연결이 있는지 체크
        const inputTaken = this.connections.some(conn =>
            conn.toNode === toNode && conn.toPin === toPin
        );
        
        if (inputTaken) {
            this.log('이 입력 핀은 이미 연결되어 있습니다.', 'error');
            return;
        }
        
        const connection = {
            id: this.connectionIdCounter++,
            fromNode,
            fromPin,
            toNode,
            toPin
        };
        
        this.connections.push(connection);
        this.updateConnections();
    }
    
    deleteConnection(connectionId) {
        this.connections = this.connections.filter(conn => conn.id !== connectionId);
        this.updateConnections();
    }
    
    updateConnections() {
        this.drawConnections();
    }
    
    drawConnections() {
        const ctx = this.canvas.getContext('2d');
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.connections.forEach(conn => {
            const fromPin = this.getPinPosition(conn.fromNode, 'output', conn.fromPin);
            const toPin = this.getPinPosition(conn.toNode, 'input', conn.toPin);
            
            if (fromPin && toPin) {
                this.drawConnection(ctx, fromPin.x, fromPin.y, toPin.x, toPin.y);
            }
        });
    }
    
    getPinPosition(node, pinType, pinIndex) {
        const pins = node.element.querySelectorAll(`.pin.${pinType} .pin-connector`);
        if (pins[pinIndex]) {
            const rect = pins[pinIndex].getBoundingClientRect();
            const containerRect = this.nodeContainer.getBoundingClientRect();
            return {
                x: rect.left + rect.width / 2 - containerRect.left,
                y: rect.top + rect.height / 2 - containerRect.top
            };
        }
        return null;
    }
    
    drawConnection(ctx, x1, y1, x2, y2) {
        ctx.strokeStyle = '#007acc';
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        // 베지어 커브로 그리기
        const cp1x = x1 + Math.abs(x2 - x1) * 0.5;
        const cp1y = y1;
        const cp2x = x2 - Math.abs(x2 - x1) * 0.5;
        const cp2y = y2;
        
        ctx.moveTo(x1, y1);
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x2, y2);
        ctx.stroke();
    }
    
    deleteNode(nodeElement) {
        const node = this.nodes.find(n => n.element === nodeElement);
        if (!node) return;
        
        // 관련된 연결 삭제
        this.connections = this.connections.filter(conn =>
            conn.fromNode !== node && conn.toNode !== node
        );
        
        this.nodes = this.nodes.filter(n => n !== node);
        nodeElement.remove();
        this.updateConnections();
        this.deselectAll();
    }
    
    executeGraph() {
        this.log('=== 그래프 실행 시작 ===', 'info');
        
        // 노드 값 초기화
        this.nodes.forEach(node => {
            node.reset();
        });
        
        // 연결된 노드들의 값을 전달하고 실행
        const executed = new Set();
        const executeNode = (node) => {
            if (executed.has(node)) return;
            
            // 입력 값을 계산
            const inputs = this.getNodeInputs(node);
            node.execute(inputs);
            executed.add(node);
            
            // 출력 노드들을 찾아서 실행
            this.connections
                .filter(conn => conn.fromNode === node)
                .forEach(conn => {
                    executeNode(conn.toNode);
                });
        };
        
        // 모든 노드 실행
        this.nodes.forEach(node => {
            if (!executed.has(node)) {
                executeNode(node);
            }
        });
        
        this.log('=== 그래프 실행 완료 ===', 'info');
    }
    
    getNodeInputs(node) {
        const inputs = [];
        const inputConnections = this.connections.filter(conn => conn.toNode === node);
        
        inputConnections.forEach(conn => {
            const outputValue = conn.fromNode.getOutput(conn.fromPin);
            inputs[conn.toPin] = outputValue;
        });
        
        return inputs;
    }
    
    clearAll() {
        this.nodes.forEach(node => node.element.remove());
        this.nodes = [];
        this.connections = [];
        this.updateConnections();
        this.log('모든 노드가 삭제되었습니다.', 'info');
    }
    
    log(message, type = 'info') {
        const line = document.createElement('div');
        line.className = `output-line ${type}`;
        line.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        this.outputDiv.appendChild(line);
        this.outputDiv.scrollTop = this.outputDiv.scrollHeight;
    }
    
    startAnimation() {
        const animate = () => {
            this.updateConnections();
            requestAnimationFrame(animate);
        };
        animate();
    }
}

// Node 클래스
class Node {
    constructor(id, type, config = {}) {
        this.id = id;
        this.type = type;
        this.config = config;
        this.element = this.createElement();
        this.outputValues = [];
        this.dragOffsetX = 0;
        this.dragOffsetY = 0;
    }
    
    createElement() {
        const node = document.createElement('div');
        node.className = 'node';
        node.dataset.nodeId = this.id;
        
        const nodeInfo = this.getNodeInfo();
        
        node.innerHTML = `
            <div class="node-header">
                <span>${nodeInfo.title}</span>
                <button class="node-close" onclick="editor.deleteNode(this.closest('.node'))">×</button>
            </div>
            <div class="node-body">
                ${this.createInputs(nodeInfo)}
                ${this.createOutputs(nodeInfo)}
            </div>
        `;
        
        return node;
    }
    
    getNodeInfo() {
        const nodeTypes = {
            number: {
                title: '숫자',
                inputs: [],
                outputs: [{ name: '값', type: 'number' }]
            },
            math: {
                title: '수학 연산',
                inputs: [
                    { name: 'A', type: 'number' },
                    { name: 'B', type: 'number' }
                ],
                outputs: [{ name: '결과', type: 'number' }]
            },
            string: {
                title: '문자열',
                inputs: [],
                outputs: [{ name: '값', type: 'string' }]
            },
            print: {
                title: '출력',
                inputs: [{ name: '입력', type: 'any' }],
                outputs: []
            }
        };
        
        return nodeTypes[this.type] || nodeTypes.number;
    }
    
    createInputs(nodeInfo) {
        if (nodeInfo.inputs.length === 0) return '';
        
        const inputsHtml = nodeInfo.inputs.map((input, index) => {
            if (this.type === 'math' && index < 2) {
                const value = index === 0 ? (this.config.valueA !== undefined ? this.config.valueA : 0) : (this.config.valueB !== undefined ? this.config.valueB : 0);
                return `
                    <div class="pin input">
                        <span class="pin-label">${input.name}</span>
                        <input type="number" class="pin-input" value="${value}" 
                               data-pin-index="${index}" onchange="this.closest('.node').__node.updateInput(${index}, this.value)">
                        <div class="pin-connector"></div>
                    </div>
                `;
            }
            
            return `
                <div class="pin input">
                    <span class="pin-label">${input.name}</span>
                    <div class="pin-connector"></div>
                </div>
            `;
        }).join('');
        
        return `<div class="node-inputs">${inputsHtml}</div>`;
    }
    
    createOutputs(nodeInfo) {
        if (nodeInfo.outputs.length === 0) return '';
        
        const outputsHtml = nodeInfo.outputs.map((output, index) => {
            let valueDisplay = '';
            if (this.type === 'number') {
                const value = this.config.value !== undefined ? this.config.value : 0;
                valueDisplay = `<input type="number" class="pin-input" value="${value}" 
                                       onchange="this.closest('.node').__node.updateInput(0, this.value)">`;
            } else if (this.type === 'string') {
                const value = this.config.value !== undefined ? this.config.value : 'Hello';
                valueDisplay = `<input type="text" class="pin-input" value="${value}" 
                                       onchange="this.closest('.node').__node.updateInput(0, this.value)">`;
            } else if (this.type === 'math') {
                const operations = ['add', 'subtract', 'multiply', 'divide'];
                const opLabels = { add: '+', subtract: '-', multiply: '×', divide: '÷' };
                const currentOp = this.config.operation || 'add';
                valueDisplay = `
                    <select class="pin-input" onchange="this.closest('.node').__node.config.operation = this.value">
                        ${operations.map(op => 
                            `<option value="${op}" ${op === currentOp ? 'selected' : ''}>${opLabels[op]}</option>`
                        ).join('')}
                    </select>
                `;
            }
            
            return `
                <div class="pin output">
                    <div class="pin-connector"></div>
                    ${valueDisplay}
                    <span class="pin-label">${output.name}</span>
                </div>
            `;
        }).join('');
        
        return `<div class="node-outputs">${outputsHtml}</div>`;
    }
    
    updateInput(index, value) {
        if (this.type === 'number') {
            this.config.value = parseFloat(value) || 0;
        } else if (this.type === 'string') {
            this.config.value = value;
        } else if (this.type === 'math') {
            if (index === 0) {
                this.config.valueA = parseFloat(value) || 0;
            } else {
                this.config.valueB = parseFloat(value) || 0;
            }
        }
    }
    
    updatePosition() {
        // 노드 위치 업데이트 시 필요한 작업
    }
    
    reset() {
        this.outputValues = [];
    }
    
    execute(inputs) {
        switch (this.type) {
            case 'number':
                this.outputValues[0] = parseFloat(this.config.value) || 0;
                break;
                
            case 'math':
                const a = inputs[0] !== undefined ? inputs[0] : (parseFloat(this.config.valueA) || 0);
                const b = inputs[1] !== undefined ? inputs[1] : (parseFloat(this.config.valueB) || 0);
                const operation = this.config.operation || 'add';
                
                let result = 0;
                switch (operation) {
                    case 'add':
                        result = a + b;
                        break;
                    case 'subtract':
                        result = a - b;
                        break;
                    case 'multiply':
                        result = a * b;
                        break;
                    case 'divide':
                        result = b !== 0 ? a / b : 0;
                        break;
                }
                this.outputValues[0] = result;
                break;
                
            case 'string':
                this.outputValues[0] = this.config.value || 'Hello';
                break;
                
            case 'print':
                const inputValue = inputs[0] !== undefined ? inputs[0] : '없음';
                editor.log(`출력: ${inputValue}`, 'info');
                break;
        }
    }
    
    getOutput(index) {
        return this.outputValues[index];
    }
}

// 에디터 초기화
let editor;
window.addEventListener('DOMContentLoaded', () => {
    editor = new NodeEditor();
});
