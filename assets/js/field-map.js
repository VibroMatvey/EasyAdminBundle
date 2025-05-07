import TomSelect from "tom-select/dist/js/tom-select.complete.min";

(function () {
    class ImageMapEditor {
        constructor() {
            this.points = new Map();
            this.areas = new Map();
            this.roads = new Map();
            this.drawMode = 'points';
            this.selectedObjects = new Set();
            this.pendingPoint = null;
            this.pendingArea = null;
            this.pendingRoad = null;
            this.youAreHerePoint = null;
            this.domCache = {};
            this.scale = 1;
            this.originX = 0;
            this.originY = 0;
            this.isDragging = false;
            this.hasDragged = false;
            this.startX = 0;
            this.startY = 0;
            this.mouseDownX = 0;
            this.mouseDownY = 0;
            this.imageWidth = 0;
            this.imageHeight = 0;
            this.init();
        }

        init() {
            document.addEventListener('DOMContentLoaded', () => {
                this.cacheDomElements();
                this.createModal();
                this.setupFileInputs();
            });
        }

        cacheDomElements() {
            this.domCache = {
                imageContainer: document.querySelector('.map-image'),
                fileInputs: document.querySelectorAll('[map-data-id="file"]'),
                pointsField: document.querySelector('[map-data-id="points"]'),
                areasField: document.querySelector('[map-data-id="areas"]'),
                roadsField: document.querySelector('[map-data-id="roads"]'),
                objectsField: document.querySelector('[map-data-id="objects"]'),
                youAreHereField: document.querySelector('[map-data-id="youAreHere"]')
            };
        }

        handleError(message, error = null) {
            console.error(`ImageMapEditor Error: ${message}`, error || '');
        }

        showWarning(message) {
            alert(message);
        }

        setupFileInputs() {
            if (!this.domCache.fileInputs.length) {
                this.handleError('No input elements with id "Map_map_file_file" found');
                return;
            }
            this.domCache.fileInputs.forEach(input => {
                const placeholder = input.getAttribute('placeholder');
                if (placeholder) {
                    this.loadImageFromPlaceholder(placeholder);
                }
                input.addEventListener('change', (event) => this.handleFileInput(event));
            });
        }

        createModal() {
            this.modal = document.createElement('div');
            Object.assign(this.modal, {
                className: 'modal fade',
                id: 'objectSelectModal',
                tabindex: '-1',
                ariaLabelledby: 'objectSelectModalLabel',
                ariaHidden: 'true'
            });

            this.modal.innerHTML = `
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="objectSelectModalLabel">Выберите объект</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body">
                            <select class="form-select form-select-sm mb-4 mt-3" id="objectSelect" autocomplete="off">
                            </select>
                        </div>
                        <div class="modal-footer">
                            <button type="button" id="confirmObject" class="btn btn-primary">Подтвердить</button>
                            <button type="button" id="cancelObject" class="btn btn-secondary" data-bs-dismiss="modal">Отмена</button>
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(this.modal);

            const objectSelect = this.modal.querySelector('#objectSelect');
            if (!objectSelect) {
                this.handleError('#objectSelect not found in modal');
                return;
            }

            try {
                this.objectSelect = new TomSelect(objectSelect, {
                    maxOptions: null,
                    placeholder: 'Выберите...',
                    allowEmptyOption: false,
                    searchField: ['text'],
                    render: {
                        option: (data, escape) => `<div>${escape(data.text)}</div>`,
                        item: (data, escape) => `<div>${escape(data.text)}</div>`
                    }
                });
            } catch (error) {
                this.handleError('Failed to initialize TomSelect', error);
            }

            this.modal.querySelector('#confirmObject')?.addEventListener('click', () => this.handleObjectConfirm());
            this.modal.querySelector('#cancelObject')?.addEventListener('click', () => this.handleObjectCancel());

            this.modal.addEventListener('hidden.bs.modal', () => {
                this.handleObjectCancel();
            });
        }

        populateObjectSelect() {
            const select = this.modal.querySelector('#objectSelect');
            if (!select) {
                this.handleError('#objectSelect not found');
                return;
            }

            const objects = JSON.parse(this.domCache.objectsField?.value || '[]');
            if (this.objectSelect) {
                this.objectSelect.clear();
                this.objectSelect.clearOptions();
                this.objectSelect.addOptions(
                    objects
                        .filter(obj => !this.selectedObjects.has(obj.id))
                        .map(obj => ({value: obj.id, text: obj.name || obj.id}))
                );
                this.objectSelect.refreshOptions();
            } else {
                select.innerHTML = '';
                objects
                    .filter(obj => !this.selectedObjects.has(obj.id))
                    .forEach(obj => {
                        const option = document.createElement('option');
                        option.value = obj.id;
                        option.textContent = obj.name || obj.id;
                        select.appendChild(option);
                    });
            }
        }

        showModal() {
            this.populateObjectSelect();
            try {
                const bootstrapModal = new bootstrap.Modal(this.modal);
                bootstrapModal.show();
            } catch (error) {
                this.handleError('Failed to show Bootstrap Modal', error);
            }
        }

        hideModal() {
            try {
                const bootstrapModal = bootstrap.Modal.getInstance(this.modal);
                bootstrapModal?.hide();
                if (this.objectSelect) {
                    this.objectSelect.clear();
                } else {
                    this.modal.querySelector('#objectSelect').value = '';
                }
            } catch (error) {
                this.handleError('Failed to hide Bootstrap Modal', error);
            }
        }

        handleObjectConfirm() {
            const select = this.modal.querySelector('#objectSelect');
            if (!select) {
                this.handleError('#objectSelect not found');
                return;
            }
            const selectedValue = this.objectSelect ? this.objectSelect.getValue() : select.value;
            if (!selectedValue) {
                this.showWarning('Необходимо выбрать объект для точки или области!');
                if (this.pendingArea) {
                    const currentAreas = this.areas.get(this.pendingArea.imageId);
                    currentAreas.splice(this.pendingArea.index, 1);
                    this.pendingArea.draw();
                    this.saveState(this.pendingArea.imageId);
                    this.pendingArea = null;
                }
                this.hideModal();
                return;
            }

            const selectedText = this.objectSelect
                ? this.objectSelect.getOption(selectedValue)?.textContent
                : select.selectedOptions[0]?.text;

            const objectName = selectedText || null;

            if (this.pendingPoint) {
                this.pendingPoint.objectId = selectedValue;
                this.pendingPoint.objectName = objectName;
                this.selectedObjects.add(selectedValue);
                console.debug('Adding point:', this.pendingPoint);
                this.points.get(this.pendingPoint.imageId).push(this.pendingPoint);
                this.pendingPoint.draw();
                this.saveState(this.pendingPoint.imageId);
                this.pendingPoint = null;
            } else if (this.pendingArea) {
                const area = this.areas.get(this.pendingArea.imageId)[this.pendingArea.index];
                area.objectId = selectedValue;
                area.objectName = objectName;
                this.selectedObjects.add(selectedValue);
                console.debug('Updating area:', area);
                this.pendingArea.draw();
                this.saveState(this.pendingArea.imageId);
                this.pendingArea = null;
            }
            this.hideModal();
        }

        handleObjectCancel() {
            if (this.pendingPoint) {
                this.pendingPoint = null;
            } else if (this.pendingArea) {
                const currentAreas = this.areas.get(this.pendingArea.imageId);
                currentAreas.splice(this.pendingArea.index, 1);
                this.pendingArea.draw();
                this.saveState(this.pendingArea.imageId);
                this.pendingArea = null;
            }
            this.hideModal();
        }

        loadImageFromPlaceholder(filename) {
            if (!this.domCache.imageContainer) {
                this.handleError('.map-image not found');
                return;
            }
            let mapContainer = this.domCache.imageContainer.querySelector('.map-content');
            if (!mapContainer) {
                mapContainer = document.createElement('div');
                mapContainer.className = 'map-content';
                this.domCache.imageContainer.appendChild(mapContainer);
            } else {
                mapContainer.innerHTML = '';
            }

            const previewContainer = this.createPreviewContainer();
            const img = new Image();
            img.src = `/Uploads/maps/${filename}`;
            img.onload = () => {
                this.processImage(img, mapContainer, previewContainer);
                this.createModeButtons(mapContainer);
            };
            img.onerror = () => this.handleError(`Failed to load image: ${filename}`);
        }

        createPreviewContainer() {
            const previewContainer = document.createElement('div');
            Object.assign(previewContainer.style, {
                marginTop: '16px',
                position: 'relative',
                overflow: 'auto',
                width: '100%'
            });
            return previewContainer;
        }

        createModeButtons(mapContainer) {
            if (!this.domCache.imageContainer || !mapContainer) {
                this.handleError('imageContainer or mapContainer not provided');
                return;
            }
            const existingButtonContainer = this.domCache.imageContainer.querySelector('.mode-buttons');
            existingButtonContainer?.remove();

            const buttonContainer = document.createElement('div');
            Object.assign(buttonContainer.style, {
                display: 'flex',
                gap: '8px',
                marginBottom: '16px'
            });
            buttonContainer.className = 'mode-buttons';

            const pointsButton = this.createModeButton('Точки', 'points');
            const areasButton = this.createModeButton('Область', 'areas');
            const roadsButton = this.createModeButton('Дороги', 'roads');
            const youAreHereButton = this.createModeButton('Вы здесь', 'youAreHere');

            if (this.domCache.pointsField) {
                buttonContainer.appendChild(pointsButton);
            }
            if (this.domCache.areasField) {
                buttonContainer.appendChild(areasButton);
            }
            if (this.domCache.roadsField) {
                buttonContainer.appendChild(roadsButton);
            }
            if (this.domCache.youAreHereField) {
                buttonContainer.appendChild(youAreHereButton);
            }
            this.domCache.imageContainer.insertBefore(buttonContainer, mapContainer);
        }

        createModeButton(text, mode) {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = text;
            button.classList.add('btn', this.drawMode === mode ? 'btn-primary' : 'btn-secondary');
            button.addEventListener('click', (e) => {
                e.preventDefault();
                this.drawMode = mode;
                this.updateModeButtons();
            });
            return button;
        }

        updateModeButtons() {
            const buttons = this.domCache.imageContainer?.querySelectorAll('.mode-buttons .btn');
            buttons?.forEach(button => {
                const isActive = button.textContent === (this.drawMode === 'points' ? 'Точки' :
                    this.drawMode === 'areas' ? 'Область' :
                        this.drawMode === 'roads' ? 'Дороги' : 'Вы здесь');
                button.classList.toggle('btn-primary', isActive);
                button.classList.toggle('btn-secondary', !isActive);
            });
        }

        zoom(zoomFactor, canvas, mouseX, mouseY) {
            const newScale = this.scale * zoomFactor;
            if (newScale < 0.1 || newScale > 10) return;

            const prevScale = this.scale;
            this.scale = newScale;
            this.originX = mouseX - (mouseX - this.originX) * (newScale / prevScale);
            this.originY = mouseY - (mouseY - this.originY) * (newScale / prevScale);

            const wrapper = canvas.parentElement;
            const img = wrapper.querySelector('img');
            if (img) {
                img.style.transform = `scale(${this.scale}) translate(${this.originX / this.scale}px, ${this.originY / this.scale}px)`;
                img.style.transformOrigin = '0 0';
            }

            canvas.width = this.imageWidth * this.scale;
            canvas.height = this.imageHeight * this.scale;
            canvas.style.width = `${this.imageWidth * this.scale}px`;
            canvas.style.height = `${this.imageHeight * this.scale}px`;

            const draw = canvas.drawFunction;
            if (draw) draw();
        }

        handleFileInput(event) {
            const files = event.target.files;
            if (!files?.length) {
                this.handleError('No files selected');
                return;
            }

            if (!this.domCache.imageContainer) {
                this.handleError('.map-image not found');
                return;
            }

            let mapContainer = this.domCache.imageContainer.querySelector('.map-content');
            if (!mapContainer) {
                mapContainer = document.createElement('div');
                mapContainer.className = 'map-content';
                this.domCache.imageContainer.appendChild(mapContainer);
            }
            mapContainer.innerHTML = '';

            const previewContainer = this.createPreviewContainer();
            this.points.clear();
            this.areas.clear();
            this.roads.clear();
            this.selectedObjects.clear();
            this.youAreHerePoint = null;
            this.scale = 1;
            this.originX = 0;
            this.originY = 0;

            Array.from(files).forEach(file => {
                if (file.type.startsWith('image/')) {
                    this.processImageFile(file, mapContainer, previewContainer);
                }
            });

            this.createModeButtons(mapContainer);
        }

        processImageFile(file, mapContainer, previewContainer) {
            const img = new Image();
            const reader = new FileReader();
            reader.onload = (e) => {
                img.src = e.target.result;
                img.onload = () => this.processImage(img, mapContainer, previewContainer);
            };
            reader.readAsDataURL(file);
        }

        processImage(img, mapContainer, previewContainer) {
            this.imageWidth = img.naturalWidth;
            this.imageHeight = img.naturalHeight;

            const {wrapper, canvas} = this.createImageWrapper(img, previewContainer);
            const imageId = Date.now().toString();
            this.points.set(imageId, []);
            this.areas.set(imageId, []);
            this.roads.set(imageId, []);

            const draw = this.createDrawFunction(canvas, imageId);
            canvas.drawFunction = draw;
            this.loadSavedData(imageId, draw, previewContainer);
            this.setupCanvasEvents(canvas, imageId, draw, previewContainer);

            wrapper.appendChild(img);
            wrapper.appendChild(canvas);
            previewContainer.appendChild(wrapper);
            mapContainer.appendChild(previewContainer);

            const scaleToFit = Math.min(previewContainer.offsetWidth / this.imageWidth, 600 / this.imageHeight);
            this.scale = scaleToFit;
            img.style.transform = `scale(${this.scale}) translate(${this.originX / this.scale}px, ${this.originY / this.scale}px)`;
            img.style.transformOrigin = '0 0';

            canvas.width = this.imageWidth * this.scale;
            canvas.height = this.imageHeight * this.scale;
            canvas.style.width = `${this.imageWidth * this.scale}px`;
            canvas.style.height = `${this.imageHeight * this.scale}px`;

            draw();
        }

        loadSavedData(imageId, draw, previewContainer) {
            const objects = JSON.parse(this.domCache.objectsField?.value || '[]');
            try {
                const savedPoints = JSON.parse(this.domCache.pointsField?.value || '[]');
                savedPoints
                    .filter(point => point.objectId)
                    .forEach(point => {
                        const obj = objects.find(o => o.id === point.objectId);
                        if (point.objectId) this.selectedObjects.add(point.objectId);
                        this.points.get(imageId).push({
                            x: point.x,
                            y: point.y,
                            objectId: point.objectId,
                            objectName: obj ? (obj.name || obj.id) : null,
                            imageId,
                            draw,
                            previewContainer
                        });
                    });
            } catch (error) {
                this.handleError('Failed to parse Map_map_points', error);
            }

            try {
                const savedAreas = JSON.parse(this.domCache.areasField?.value || '[]');
                savedAreas
                    .filter(area => area.objectId)
                    .forEach(area => {
                        const areaPoints = Array.isArray(area.points) ? area.points : [];
                        const obj = objects.find(o => o.id === area.objectId);
                        if (areaPoints.length > 0) {
                            this.areas.get(imageId).push({
                                points: areaPoints,
                                objectId: area.objectId,
                                objectName: obj ? (obj.name || obj.id) : null,
                                completed: true,
                                draw,
                                previewContainer
                            });
                        }
                    });
            } catch (error) {
                this.handleError('Failed to parse Map_map_areas', error);
            }

            try {
                const savedRoads = JSON.parse(this.domCache.roadsField?.value || '[]');
                savedRoads.forEach(road => {
                    if (road.from && road.to) {
                        this.roads.get(imageId).push({
                            from: { x: road.from.x, y: road.from.y },
                            to: { x: road.to.x, y: road.to.y },
                            imageId,
                            draw,
                            previewContainer
                        });
                    }
                });
            } catch (error) {
                this.handleError('Failed to parse Map_map_roads', error);
            }

            try {
                const savedYouAreHere = JSON.parse(this.domCache.youAreHereField?.value || '{}');
                if (savedYouAreHere.x && savedYouAreHere.y) {
                    this.youAreHerePoint = {
                        x: savedYouAreHere.x,
                        y: savedYouAreHere.y,
                        imageId,
                        draw,
                        previewContainer
                    };
                }
            } catch (error) {
                this.handleError('Failed to parse Map_map_youAreHere', error);
            }
        }

        createImageWrapper(img, previewContainer) {
            const wrapper = document.createElement('div');
            Object.assign(wrapper.style, {
                position: 'relative',
                width: `${this.imageWidth * this.scale}px`,
                height: `${this.imageHeight * this.scale}px`
            });

            Object.assign(previewContainer.style, {
                width: '100%',
                height: 'auto',
                overflow: 'auto'
            });

            Object.assign(img.style, {
                width: `${this.imageWidth}px`,
                height: `${this.imageHeight}px`,
                objectFit: 'contain',
                position: 'absolute',
                top: '0',
                left: '0'
            });

            const canvas = document.createElement('canvas');
            Object.assign(canvas.style, {
                position: 'absolute',
                top: '0',
                left: '0',
                width: `${this.imageWidth * this.scale}px`,
                height: `${this.imageHeight * this.scale}px`,
                zIndex: '1'
            });

            return {wrapper, canvas};
        }

        createDrawFunction(canvas, imageId) {
            return () => {
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.save();

                ctx.scale(this.scale, this.scale);
                ctx.translate(this.originX / this.scale, this.originY / this.scale);

                if (this.drawMode === 'points' || this.points.get(imageId).length) {
                    this.points.get(imageId).forEach(point => {
                        ctx.beginPath();
                        ctx.arc(point.x, point.y, 5 / this.scale, 0, 2 * Math.PI);
                        ctx.fillStyle = 'red';
                        ctx.fill();

                        if (point.objectName) {
                            ctx.font = `${12 / this.scale}px Arial`;
                            ctx.fillStyle = 'black';
                            ctx.fillText(point.objectName, point.x + 8 / this.scale, point.y - 8 / this.scale);
                            console.debug(`Rendering point with name: ${point.objectName}`);
                        }
                    });
                }

                if (this.drawMode === 'areas' || this.areas.get(imageId).length) {
                    this.areas.get(imageId).forEach(area => {
                        const points = area.points || [];
                        if (points.length) {
                            ctx.beginPath();
                            ctx.moveTo(points[0].x, points[0].y);
                            for (let i = 1; i < points.length; i++) {
                                ctx.lineTo(points[i].x, points[i].y);
                            }
                            if (area.completed) ctx.closePath();
                            ctx.fillStyle = 'rgba(0, 0, 255, 0.3)';
                            ctx.fill();
                            ctx.strokeStyle = 'blue';
                            ctx.stroke();

                            points.forEach(point => {
                                ctx.beginPath();
                                ctx.arc(point.x, point.y, 3 / this.scale, 0, 2 * Math.PI);
                                ctx.fillStyle = 'blue';
                                ctx.fill();
                            });

                            if (area.objectName && points.length) {
                                ctx.font = `${12 / this.scale}px Arial`;
                                ctx.fillStyle = 'black';
                                ctx.fillText(area.objectName, points[0].x + 8 / this.scale, points[0].y - 8 / this.scale);
                                console.debug(`Rendering area with name: ${area.objectName}`);
                            }
                        }
                    });
                }

                if (this.drawMode === 'roads' || this.roads.get(imageId).length) {
                    this.roads.get(imageId).forEach(road => {
                        ctx.beginPath();
                        ctx.moveTo(road.from.x, road.from.y);
                        ctx.lineTo(road.to.x, road.to.y);
                        ctx.strokeStyle = 'black';
                        ctx.lineWidth = 2 / this.scale;
                        ctx.stroke();

                        ctx.beginPath();
                        ctx.arc(road.from.x, road.from.y, 3 / this.scale, 0, 2 * Math.PI);
                        ctx.fillStyle = 'black';
                        ctx.fill();

                        ctx.beginPath();
                        ctx.arc(road.to.x, road.to.y, 3 / this.scale, 0, 2 * Math.PI);
                        ctx.fillStyle = 'black';
                        ctx.fill();
                    });
                }

                if (this.youAreHerePoint && this.youAreHerePoint.imageId === imageId) {
                    ctx.beginPath();
                    ctx.arc(this.youAreHerePoint.x, this.youAreHerePoint.y, 7 / this.scale, 0, 2 * Math.PI);
                    ctx.fillStyle = 'green';
                    ctx.fill();

                    ctx.font = `${14 / this.scale}px Arial`;
                    ctx.fillStyle = 'black';
                    ctx.fillText('Вы здесь', this.youAreHerePoint.x + 10 / this.scale, this.youAreHerePoint.y - 10 / this.scale);
                    console.debug('Rendering You Are Here point');
                }

                ctx.restore();
            };
        }

        saveState(imageId) {
            if (!this.domCache.pointsField || !this.domCache.areasField || !this.domCache.roadsField) {
                this.handleError('Map_map_points, Map_map_areas, or Map_map_roads not found');
                return;
            }
            const state = {
                points: this.points.get(imageId).map(point => ({
                    x: point.x,
                    y: point.y,
                    objectId: point.objectId
                })),
                areas: this.areas.get(imageId).filter(area => area.points.length > 0).map(area => ({
                    points: area.points,
                    objectId: area.objectId
                })),
                roads: this.roads.get(imageId).map(road => ({
                    from: { x: road.from.x, y: road.from.y },
                    to: { x: road.to.x, y: road.to.y }
                })),
                youAreHere: this.youAreHerePoint && this.youAreHerePoint.imageId === imageId ? {
                    x: this.youAreHerePoint.x,
                    y: this.youAreHerePoint.y
                } : null
            };
            this.domCache.pointsField.value = JSON.stringify(state.points);
            this.domCache.areasField.value = JSON.stringify(state.areas);
            this.domCache.roadsField.value = JSON.stringify(state.roads);
            if (this.domCache.youAreHereField) {
                this.domCache.youAreHereField.value = JSON.stringify(state.youAreHere || {});
            }
        }

        setupCanvasEvents(canvas, imageId, draw, previewContainer) {
            canvas.addEventListener('click', (event) => {
                if (this.hasDragged) {
                    this.hasDragged = false;
                    return;
                }
                event.stopPropagation();
                const {x, y} = this.getCanvasCoordinates(event, canvas);
                if (this.drawMode === 'points') {
                    this.handlePointModeClick(imageId, x, y, draw, previewContainer);
                } else if (this.drawMode === 'areas') {
                    this.handleAreaModeClick(imageId, x, y);
                } else if (this.drawMode === 'roads') {
                    this.handleRoadModeClick(imageId, x, y, draw, previewContainer);
                } else if (this.drawMode === 'youAreHere') {
                    this.handleYouAreHereClick(imageId, x, y, draw, previewContainer);
                }
                draw();
                this.saveState(imageId);
            });

            canvas.addEventListener('contextmenu', (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (this.drawMode === 'areas') {
                    this.handleAreaModeRightClick(imageId, draw, previewContainer);
                    draw();
                    this.saveState(imageId);
                }
            });

            canvas.addEventListener('wheel', (event) => {
                if (!event.ctrlKey) return;
                event.preventDefault();
                const rect = canvas.getBoundingClientRect();
                const mouseX = event.clientX - rect.left;
                const mouseY = event.clientY - rect.top;
                const zoomFactor = event.deltaY < 0 ? 1.1 : 0.9;
                this.zoom(zoomFactor, canvas, mouseX, mouseY);
            });

            canvas.addEventListener('mousedown', (event) => {
                if (event.button === 0 && event.ctrlKey) {
                    this.isDragging = true;
                    this.mouseDownX = event.clientX;
                    this.mouseDownY = event.clientY;
                    const rect = canvas.getBoundingClientRect();
                    this.startX = (event.clientX - rect.left) - this.originX;
                    this.startY = (event.clientY - rect.top) - this.originY;
                }
            });

            canvas.addEventListener('mousemove', (event) => {
                if (this.isDragging) {
                    this.hasDragged = true;
                    const rect = canvas.getBoundingClientRect();
                    this.originX = (event.clientX - rect.left) - this.startX;
                    this.originY = (event.clientY - rect.top) - this.startY;
                    const wrapper = canvas.parentElement;
                    const img = wrapper.querySelector('img');
                    if (img) {
                        img.style.transform = `scale(${this.scale}) translate(${this.originX / this.scale}px, ${this.originY / this.scale}px)`;
                        img.style.transformOrigin = '0 0';
                    }
                    draw();
                }
            });

            canvas.addEventListener('mouseup', (event) => {
                if (this.isDragging) {
                    const deltaX = Math.abs(event.clientX - this.mouseDownX);
                    const deltaY = Math.abs(event.clientY - this.mouseDownY);
                    if (deltaX > 5 || deltaY > 5) {
                        this.hasDragged = true;
                    }
                }
                this.isDragging = false;
            });

            canvas.addEventListener('mouseleave', () => {
                this.isDragging = false;
                this.hasDragged = false;
            });

            const outsideClickHandler = (event) => {
                if (!canvas.contains(event.target) && this.drawMode === 'areas' && !this.modal.contains(event.target)) {
                    this.handleAreaModeRightClick(imageId, draw, previewContainer);
                    draw();
                    this.saveState(imageId);
                }
            };

            document.addEventListener('click', outsideClickHandler);

            canvas.addEventListener('remove', () => {
                document.removeEventListener('click', outsideClickHandler);
            });
        }

        getCanvasCoordinates(event, canvas) {
            const rect = canvas.getBoundingClientRect();
            const x = (event.clientX - rect.left - this.originX) / this.scale;
            const y = (event.clientY - rect.top - this.originY) / this.scale;
            return {x, y};
        }

        findNearestRoadEndpoint(imageId, x, y, threshold = 25) {
            const roads = this.roads.get(imageId);
            let nearestPoint = null;
            let minDistance = Infinity;

            roads.forEach(road => {
                const points = [
                    { x: road.from.x, y: road.from.y },
                    { x: road.to.x, y: road.to.y }
                ];
                points.forEach(point => {
                    const distance = Math.sqrt((point.x - x) ** 2 + (point.y - y) ** 2);
                    if (distance < threshold / this.scale && distance < minDistance) {
                        minDistance = distance;
                        nearestPoint = point;
                    }
                });
            });

            return nearestPoint;
        }

        distanceToSegment(px, py, x1, y1, x2, y2) {
            const dx = x2 - x1;
            const dy = y2 - y1;
            const lengthSquared = dx * dx + dy * dy;

            if (lengthSquared === 0) {
                return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
            }

            let t = ((px - x1) * dx + (py - y1) * dy) / lengthSquared;
            t = Math.max(0, Math.min(1, t));

            const projectionX = x1 + t * dx;
            const projectionY = y1 + t * dy;

            return Math.sqrt((px - projectionX) ** 2 + (py - projectionY) ** 2);
        }

        handlePointModeClick(imageId, x, y, draw, previewContainer) {
            const currentPoints = this.points.get(imageId);
            for (let i = 0; i < currentPoints.length; i++) {
                const point = currentPoints[i];
                if (Math.sqrt((point.x - x) ** 2 + (point.y - y) ** 2) < 10 / this.scale) {
                    if (point.objectId) this.selectedObjects.delete(point.objectId);
                    currentPoints.splice(i, 1);
                    draw();
                    this.saveState(imageId);
                    return;
                }
            }

            this.pendingPoint = {x, y, imageId, draw, previewContainer};
            this.showModal();
        }

        handleRoadModeClick(imageId, x, y, draw, previewContainer) {
            const currentRoads = this.roads.get(imageId);
            const clickThreshold = 5 / this.scale; // Порог для удаления дороги по клику на линию

            // Проверяем, попал ли клик на линию дороги
            for (let i = 0; i < currentRoads.length; i++) {
                const road = currentRoads[i];
                const distance = this.distanceToSegment(
                    x, y,
                    road.from.x, road.from.y,
                    road.to.x, road.to.y
                );
                if (distance < clickThreshold) {
                    currentRoads.splice(i, 1);
                    draw();
                    this.saveState(imageId);
                    return;
                }
            }

            // Проверяем, попал ли клик по конечной точке (from или to)
            const nearestPoint = this.findNearestRoadEndpoint(imageId, x, y);
            const pointToUse = nearestPoint ? { x: nearestPoint.x, y: nearestPoint.y } : { x, y };

            // Если нет pendingRoad, создаем новую дорогу с точкой from
            if (!this.pendingRoad) {
                this.pendingRoad = {
                    from: pointToUse,
                    imageId,
                    draw,
                    previewContainer
                };
            } else {
                // Устанавливаем точку to и завершаем дорогу
                this.pendingRoad.to = pointToUse;
                currentRoads.push(this.pendingRoad);
                this.pendingRoad = null;
                draw();
                this.saveState(imageId);
            }
        }

        handleYouAreHereClick(imageId, x, y, draw, previewContainer) {
            if (this.youAreHerePoint && this.youAreHerePoint.imageId === imageId) {
                if (Math.sqrt((this.youAreHerePoint.x - x) ** 2 + (this.youAreHerePoint.y - y) ** 2) < 10 / this.scale) {
                    this.youAreHerePoint = null;
                    draw();
                    this.saveState(imageId);
                }
            } else {
                this.youAreHerePoint = {x, y, imageId, draw, previewContainer};
                draw();
                this.saveState(imageId);
            }
        }

        handleAreaModeClick(imageId, x, y) {
            const currentAreas = this.areas.get(imageId);
            for (let i = 0; i < currentAreas.length; i++) {
                const area = currentAreas[i];
                const points = area.points || [];
                for (let j = 0; j < points.length; j++) {
                    if (Math.sqrt((points[j].x - x) ** 2 + (points[j].y - y) ** 2) < 10 / this.scale) {
                        points.splice(j, 1);
                        area.points = points;
                        if (!points.length && area.objectId) {
                            this.selectedObjects.delete(area.objectId);
                            currentAreas.splice(i, 1);
                        }
                        return;
                    }
                }
            }

            if (!currentAreas.length || currentAreas[currentAreas.length - 1].completed) {
                currentAreas.push({points: [{x, y}], completed: false});
            } else {
                currentAreas[currentAreas.length - 1].points.push({x, y});
            }
        }

        handleAreaModeRightClick(imageId, draw, previewContainer) {
            const currentAreas = this.areas.get(imageId);
            if (currentAreas.length && !currentAreas[currentAreas.length - 1].completed) {
                const areaIndex = currentAreas.length - 1;
                if (currentAreas[areaIndex].points.length >= 3) {
                    currentAreas[areaIndex].completed = true;
                    this.pendingArea = {imageId, index: areaIndex, draw, previewContainer};
                    this.showModal();
                } else {
                    currentAreas.splice(areaIndex, 1);
                    draw();
                    this.saveState(imageId);
                }
            }
        }
    }

    new ImageMapEditor();
})();