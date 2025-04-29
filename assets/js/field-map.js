import TomSelect from "tom-select/dist/js/tom-select.complete.min";

(function () {
    class ImageMapEditor {
        constructor() {
            this.points = new Map();
            this.areas = new Map();
            this.drawMode = 'points';
            this.selectedObjects = new Set();
            this.pendingPoint = null;
            this.pendingArea = null;
            this.domCache = {};
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
                fileInputs: document.querySelectorAll('#Map_map_file_file'),
                pointsField: document.getElementById('Map_map_points'),
                areasField: document.getElementById('Map_map_areas'),
                objectsField: document.getElementById('Map_map_objects')
            };
        }

        handleError(message, error = null) {
            console.error(`ImageMapEditor Error: ${message}`, error || '');
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
                <div class="modal-dialog fade show">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="objectSelectModalLabel">Выберите объект</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body">
                            <select class="form-select form-select-sm mb-4 mt-3" id="objectSelect" autocomplete="off">
                                <option value="" selected>Без привязки</option>
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
                    allowEmptyOption: true,
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
                this.objectSelect.addOption({value: '', text: 'Без привязки'});
                this.objectSelect.addOptions(
                    objects
                        .filter(obj => !this.selectedObjects.has(obj.id))
                        .map(obj => ({value: obj.id, text: obj.name || obj.id}))
                );
                this.objectSelect.refreshOptions();
            } else {
                select.innerHTML = '<option value="">Без привязки</option>';
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
            const selectedText = this.objectSelect
                ? this.objectSelect.getOption(selectedValue)?.textContent
                : select.selectedOptions[0]?.text;

            const objectName = selectedText !== 'Без привязки' ? selectedText : null;

            if (this.pendingPoint) {
                this.pendingPoint.objectId = selectedValue || null;
                this.pendingPoint.objectName = objectName;
                if (selectedValue) this.selectedObjects.add(selectedValue);
                console.debug('Adding point:', this.pendingPoint); // Debugging
                this.points.get(this.pendingPoint.imageId).push(this.pendingPoint);
                this.pendingPoint.draw();
                this.saveState(this.pendingPoint.imageId);
                this.pendingPoint = null;
            } else if (this.pendingArea) {
                const area = this.areas.get(this.pendingArea.imageId)[this.pendingArea.index];
                area.objectId = selectedValue || null;
                area.objectName = objectName;
                if (selectedValue) this.selectedObjects.add(selectedValue);
                console.debug('Updating area:', area); // Debugging
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
                position: 'relative'
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

            buttonContainer.appendChild(pointsButton);
            buttonContainer.appendChild(areasButton);
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
                button.classList.toggle('btn-primary', button.textContent === (this.drawMode === 'points' ? 'Точки' : 'Область'));
                button.classList.toggle('btn-secondary', button.textContent !== (this.drawMode === 'points' ? 'Точки' : 'Область'));
            });
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
            this.selectedObjects.clear();

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
            const {wrapper, canvas} = this.createImageWrapper(img, previewContainer);
            const imageId = Date.now().toString();
            this.points.set(imageId, []);
            this.areas.set(imageId, []);

            const draw = this.createDrawFunction(canvas, imageId);
            this.loadSavedData(imageId, draw, previewContainer);
            this.setupCanvasEvents(canvas, imageId, draw, previewContainer);

            wrapper.appendChild(img);
            wrapper.appendChild(canvas);
            previewContainer.appendChild(wrapper);
            mapContainer.appendChild(previewContainer);

            draw();
        }

        loadSavedData(imageId, draw, previewContainer) {
            const objects = JSON.parse(this.domCache.objectsField?.value || '[]');
            try {
                const savedPoints = JSON.parse(this.domCache.pointsField?.value || '[]');
                savedPoints.forEach(point => {
                    const obj = objects.find(o => o.id === point.objectId);
                    if (point.objectId) this.selectedObjects.add(point.objectId);
                    this.points.get(imageId).push({
                        x: point.x,
                        y: point.y,
                        objectId: point.objectId || null,
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
                savedAreas.forEach(area => {
                    const areaPoints = Array.isArray(area.points) ? area.points : [];
                    const obj = objects.find(o => o.id === area.objectId);
                    if (areaPoints.length > 0) {
                        this.areas.get(imageId).push({
                            points: areaPoints,
                            objectId: area.objectId || null,
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
        }

        createImageWrapper(img, previewContainer) {
            const wrapper = document.createElement('div');
            Object.assign(wrapper.style, {
                position: 'relative',
                width: `${img.naturalWidth}px`,
                height: `${img.naturalHeight}px`
            });

            Object.assign(previewContainer.style, {
                width: `${img.naturalWidth}px`,
                height: `${img.naturalHeight}px`
            });

            Object.assign(img.style, {
                width: '100%',
                height: '100%',
                objectFit: 'contain'
            });

            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            Object.assign(canvas.style, {
                position: 'absolute',
                top: '0',
                left: '0'
            });

            return {wrapper, canvas};
        }

        createDrawFunction(canvas, imageId) {
            return () => {
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, canvas.width, canvas.height);

                if (this.drawMode === 'points' || this.points.get(imageId).length) {
                    this.points.get(imageId).forEach(point => {
                        ctx.beginPath();
                        ctx.arc(point.x, point.y, 5, 0, 2 * Math.PI);
                        ctx.fillStyle = 'red';
                        ctx.fill();
                        ctx.strokeStyle = 'black';
                        ctx.stroke();

                        if (point.objectName) {
                            ctx.font = '12px Arial';
                            ctx.fillStyle = 'black';
                            ctx.fillText(point.objectName, point.x + 8, point.y - 8);
                            console.debug(`Rendering point with name: ${point.objectName}`); // Debugging
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
                                ctx.arc(point.x, point.y, 3, 0, 2 * Math.PI);
                                ctx.fillStyle = 'blue';
                                ctx.fill();
                            });

                            if (area.objectName && points.length) {
                                ctx.font = '12px Arial';
                                ctx.fillStyle = 'black';
                                ctx.fillText(area.objectName, points[0].x + 8, points[0].y - 8);
                                console.debug(`Rendering area with name: ${area.objectName}`); // Debugging
                            }
                        }
                    });
                }
            };
        }

        saveState(imageId) {
            if (!this.domCache.pointsField || !this.domCache.areasField) {
                this.handleError('Map_map_points or Map_map_areas not found');
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
                }))
            };
            this.domCache.pointsField.value = JSON.stringify(state.points);
            this.domCache.areasField.value = JSON.stringify(state.areas);
        }

        setupCanvasEvents(canvas, imageId, draw, previewContainer) {
            canvas.addEventListener('click', (event) => {
                const {x, y} = this.getCanvasCoordinates(event, canvas);
                if (this.drawMode === 'points') {
                    this.handlePointModeClick(imageId, x, y, draw, previewContainer);
                } else {
                    this.handleAreaModeClick(imageId, x, y);
                }
                draw();
                this.saveState(imageId);
            });

            canvas.addEventListener('contextmenu', (event) => {
                event.preventDefault();
                if (this.drawMode === 'areas') {
                    this.handleAreaModeRightClick(imageId, draw, previewContainer);
                    draw();
                    this.saveState(imageId);
                }
            });
        }

        getCanvasCoordinates(event, canvas) {
            const rect = canvas.getBoundingClientRect();
            return {
                x: event.clientX - rect.left,
                y: event.clientY - rect.top
            };
        }

        handlePointModeClick(imageId, x, y, draw, previewContainer) {
            const currentPoints = this.points.get(imageId);
            for (let i = 0; i < currentPoints.length; i++) {
                const point = currentPoints[i];
                if (Math.sqrt((point.x - x) ** 2 + (point.y - y) ** 2) < 10) {
                    if (point.objectId) this.selectedObjects.delete(point.objectId);
                    currentPoints.splice(i, 1);
                    return;
                }
            }

            this.pendingPoint = {x, y, imageId, draw, previewContainer};
            this.showModal();
        }

        handleAreaModeClick(imageId, x, y) {
            const currentAreas = this.areas.get(imageId);
            for (let i = 0; i < currentAreas.length; i++) {
                const area = currentAreas[i];
                const points = area.points || [];
                for (let j = 0; j < points.length; j++) {
                    if (Math.sqrt((points[j].x - x) ** 2 + (points[j].y - y) ** 2) < 10) {
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
                currentAreas[areaIndex].completed = true;
                this.pendingArea = {imageId, index: areaIndex, draw, previewContainer};
                this.showModal();
            }
        }
    }

    new ImageMapEditor();
})();