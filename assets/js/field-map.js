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
            this.init();
        }

        init() {
            document.addEventListener('DOMContentLoaded', () => {
                this.createModal();
                const inputs = document.querySelectorAll('#Map_map_file_file');
                if (!inputs.length) {
                    console.warn('No input elements with id "Map_map_file_file" found');
                    return;
                }
                inputs.forEach(input => {
                    const imageContainer = document.querySelector('.map-image');
                    if (!imageContainer) {
                        console.error('Error: .map-image not found');
                        return;
                    }
                    let mapContainer = imageContainer.querySelector('.map-content');
                    if (!mapContainer) {
                        mapContainer = document.createElement('div');
                        mapContainer.className = 'map-content';
                        imageContainer.appendChild(mapContainer);
                    }
                    const placeholder = input.getAttribute('placeholder');
                    if (placeholder) {
                        this.loadImageFromPlaceholder(placeholder, input);
                    }
                    input.addEventListener('change', (event) => this.handleFileInput(event, mapContainer));
                });
            });
        }

        createModal() {
            this.modal = document.createElement('div');
            this.modal.className = 'modal fade';
            this.modal.id = 'objectSelectModal';
            this.modal.setAttribute('tabindex', '-1');
            this.modal.setAttribute('aria-labelledby', 'objectSelectModalLabel');
            this.modal.setAttribute('aria-hidden', 'true');

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

            const objectSelectElement = this.modal.querySelector('#objectSelect');
            if (!objectSelectElement) {
                console.error('Error: #objectSelect not found in modal');
                return;
            }

            try {
                this.objectSelect = new TomSelect(objectSelectElement, {
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
                console.error('Error initializing TomSelect:', error);
            }

            const confirmButton = this.modal.querySelector('#confirmObject');
            const cancelButton = this.modal.querySelector('#cancelObject');
            if (confirmButton) {
                confirmButton.addEventListener('click', () => this.handleObjectConfirm());
            } else {
                console.error('Error: #confirmObject button not found');
            }
            if (cancelButton) {
                cancelButton.addEventListener('click', () => this.handleObjectCancel());
            } else {
                console.error('Error: #cancelObject button not found');
            }
        }

        populateObjectSelect() {
            const select = this.modal.querySelector('#objectSelect');
            if (!select) {
                console.error('Error: #objectSelect not found');
                return;
            }
            const objectsField = document.querySelector('#Map_map_objects');
            if (objectsField) {
                const objects = JSON.parse(objectsField.value || '[]');
                if (this.objectSelect) {
                    this.objectSelect.clear();
                    this.objectSelect.clearOptions();
                    this.objectSelect.addOption({value: '', text: 'Без привязки'});
                }
                select.innerHTML = '<option value="">Без привязки</option>';
                const options = objects
                    .filter(obj => !this.selectedObjects.has(obj.id))
                    .map(obj => ({
                        value: obj.id,
                        text: obj.name || obj.id
                    }));
                if (this.objectSelect) {
                    this.objectSelect.addOptions(options);
                    this.objectSelect.refreshOptions();
                } else {
                    options.forEach(obj => {
                        const option = document.createElement('option');
                        option.value = obj.value;
                        option.textContent = obj.text;
                        select.appendChild(option);
                    });
                }
            } else {
                console.warn('Warning: #Map_map_objects not found');
            }
        }

        showModal() {
            this.populateObjectSelect();
            try {
                const bootstrapModal = new bootstrap.Modal(this.modal);
                bootstrapModal.show();
            } catch (error) {
                console.error('Error showing Bootstrap Modal:', error);
            }
        }

        hideModal() {
            try {
                const bootstrapModal = bootstrap.Modal.getInstance(this.modal);
                if (bootstrapModal) {
                    bootstrapModal.hide();
                }
                if (this.objectSelect) {
                    this.objectSelect.clear();
                } else {
                    this.modal.querySelector('#objectSelect').value = '';
                }
            } catch (error) {
                console.error('Error hiding Bootstrap Modal:', error);
            }
        }

        handleObjectConfirm() {
            const select = this.modal.querySelector('#objectSelect');
            if (!select) {
                console.error('Error: #objectSelect not found');
                return;
            }
            const selectedValue = this.objectSelect ? this.objectSelect.getValue() : select.value;
            if (this.pendingPoint) {
                this.pendingPoint.objectId = selectedValue || null;
                if (selectedValue) {
                    this.selectedObjects.add(selectedValue);
                }
                this.points.get(this.pendingPoint.imageId).push(this.pendingPoint);
                this.pendingPoint.draw();
                this.saveState(this.pendingPoint.imageId, this.pendingPoint.previewContainer);
                this.pendingPoint = null;
            } else if (this.pendingArea) {
                this.pendingArea.objectId = selectedValue || null;
                if (selectedValue) {
                    this.selectedObjects.add(selectedValue);
                }
                this.areas.get(this.pendingArea.imageId)[this.pendingArea.index].objectId = selectedValue || null;
                this.pendingArea.draw();
                this.saveState(this.pendingArea.imageId, this.pendingArea.previewContainer);
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
                this.saveState(this.pendingArea.imageId, this.pendingArea.previewContainer);
                this.pendingArea = null;
            }
            this.hideModal();
        }

        loadImageFromPlaceholder(filename, input) {
            const imageContainer = document.querySelector('.map-image');
            if (!imageContainer) {
                console.error('Error: .map-image not found');
                return;
            }
            let mapContainer = imageContainer.querySelector('.map-content');
            if (!mapContainer) {
                mapContainer = document.createElement('div');
                mapContainer.className = 'map-content';
                imageContainer.appendChild(mapContainer);
            } else {
                mapContainer.innerHTML = '';
            }

            const previewContainer = document.createElement('div');
            previewContainer.style.marginTop = "16px";
            previewContainer.style.position = "relative";
            previewContainer.innerHTML = '';

            const img = new Image();
            img.src = `/Uploads/maps/${filename}`;
            img.onload = () => {
                this.processImage(img, mapContainer, previewContainer);
                this.createModeButtons(imageContainer, mapContainer);
            };
            img.onerror = () => {
                console.error(`Failed to load image from placeholder: ${filename}`);
            };
        }

        createModeButtons(imageContainer, mapContainer) {
            if (!imageContainer || !mapContainer) {
                console.error('Error: imageContainer or mapContainer not provided');
                return;
            }
            const existingButtonContainer = imageContainer.querySelector('.mode-buttons');
            if (existingButtonContainer) {
                existingButtonContainer.remove();
            }

            // Ensure mapContainer is a child of imageContainer
            if (mapContainer.parentNode !== imageContainer) {
                imageContainer.appendChild(mapContainer);
            }

            const buttonContainer = document.createElement('div');
            buttonContainer.className = 'mode-buttons';
            buttonContainer.style.display = 'flex';
            buttonContainer.style.gap = '8px';
            buttonContainer.style.marginBottom = '16px';

            const pointsButton = document.createElement('button');
            pointsButton.type = 'button';
            pointsButton.textContent = 'Точки';
            pointsButton.classList.add('btn', this.drawMode === 'points' ? 'btn-primary' : 'btn-secondary');
            pointsButton.addEventListener('click', (e) => {
                e.preventDefault();
                this.drawMode = 'points';
                pointsButton.classList.remove('btn-secondary');
                pointsButton.classList.add('btn-primary');
                areasButton.classList.remove('btn-primary');
                areasButton.classList.add('btn-secondary');
            });

            const areasButton = document.createElement('button');
            areasButton.type = 'button';
            areasButton.textContent = 'Область';
            areasButton.classList.add('btn', this.drawMode === 'areas' ? 'btn-primary' : 'btn-secondary');
            areasButton.addEventListener('click', (e) => {
                e.preventDefault();
                this.drawMode = 'areas';
                areasButton.classList.remove('btn-secondary');
                areasButton.classList.add('btn-primary');
                pointsButton.classList.remove('btn-primary');
                pointsButton.classList.add('btn-secondary');
            });

            buttonContainer.appendChild(pointsButton);
            buttonContainer.appendChild(areasButton);
            imageContainer.insertBefore(buttonContainer, mapContainer);
            return buttonContainer;
        }

        handleFileInput(event, mapContainer) {
            const files = event.target.files;
            if (!files || files.length === 0) {
                console.warn('No files selected');
                return;
            }

            const imageContainer = document.querySelector('.map-image');
            if (!imageContainer) {
                console.error('Error: .map-image not found');
                return;
            }

            // Ensure mapContainer is valid and attached to imageContainer
            if (!mapContainer || mapContainer.parentNode !== imageContainer) {
                mapContainer = document.createElement('div');
                mapContainer.className = 'map-content';
                imageContainer.appendChild(mapContainer);
            }
            mapContainer.innerHTML = '';

            const previewContainer = document.createElement('div');
            previewContainer.style.marginTop = "16px";
            previewContainer.style.position = "relative";

            this.points.clear();
            this.areas.clear();
            this.selectedObjects.clear();

            Array.from(files).forEach(file => {
                if (file.type.startsWith('image/')) {
                    this.processImageFile(file, mapContainer, previewContainer);
                }
            });

            this.createModeButtons(imageContainer, mapContainer);
        }

        processImageFile(file, mapContainer, previewContainer) {
            const img = new Image();
            const reader = new FileReader();
            reader.onload = (e) => {
                img.src = e.target.result;
                img.onload = () => {
                    this.processImage(img, mapContainer, previewContainer);
                };
            };
            reader.readAsDataURL(file);
        }

        processImage(img, mapContainer, previewContainer) {
            const {wrapper, canvas} = this.createImageWrapper(img, previewContainer);
            const imageId = Date.now().toString();
            this.points.set(imageId, []);
            this.areas.set(imageId, []);

            const pointsField = document.getElementById("Map_map_points");
            const areasField = document.getElementById("Map_map_areas");
            if (pointsField && pointsField.value) {
                try {
                    const savedPoints = JSON.parse(pointsField.value || '[]');
                    savedPoints.forEach(point => {
                        if (point.objectId) {
                            this.selectedObjects.add(point.objectId);
                        }
                        this.points.get(imageId).push({
                            x: point.x,
                            y: point.y,
                            objectId: point.objectId || null,
                            imageId,
                            draw: () => {
                            },
                            previewContainer
                        });
                    });
                } catch (error) {
                    console.error('Error parsing Map_map_points:', error);
                }
            } else {
                console.warn('Warning: #Map_map_points not found or empty');
            }
            if (areasField && areasField.value) {
                try {
                    const savedAreas = JSON.parse(areasField.value || '[]');
                    savedAreas.forEach(area => {
                        const areaPoints = Array.isArray(area.points) ? area.points : (area.points || []);
                        if (areaPoints.length > 0) {
                            this.areas.get(imageId).push({
                                points: areaPoints,
                                objectId: area.objectId || null,
                                completed: true
                            });
                        }
                    });
                } catch (error) {
                    console.error('Error parsing Map_map_areas:', error);
                }
            } else {
                console.warn('Warning: #Map_map_areas not found or empty');
            }

            const draw = this.createDrawFunction(canvas, imageId);
            this.setupCanvasEvents(canvas, imageId, draw, previewContainer);

            this.points.get(imageId).forEach(point => {
                point.draw = draw;
            });

            wrapper.appendChild(img);
            wrapper.appendChild(canvas);
            previewContainer.appendChild(wrapper);
            mapContainer.appendChild(previewContainer);

            draw();
        }

        createImageWrapper(img, previewContainer) {
            const wrapper = document.createElement('div');
            wrapper.style.position = 'relative';
            wrapper.style.width = `${img.naturalWidth}px`;
            wrapper.style.height = `${img.naturalHeight}px`;
            previewContainer.style.width = `${img.naturalWidth}px`;
            previewContainer.style.height = `${img.naturalHeight}px`;

            img.style.width = '100%';
            img.style.height = '100%';
            img.style.objectFit = 'contain';

            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            canvas.style.position = 'absolute';
            canvas.style.top = '0';
            canvas.style.left = '0';

            return {wrapper, canvas};
        }

        createDrawFunction(canvas, imageId) {
            return () => {
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, canvas.width, canvas.height);

                if (this.drawMode === 'points' || this.points.get(imageId).length > 0) {
                    this.points.get(imageId).forEach(point => {
                        ctx.beginPath();
                        ctx.arc(point.x, point.y, 5, 0, 2 * Math.PI);
                        ctx.fillStyle = 'red';
                        ctx.fill();
                        ctx.strokeStyle = 'black';
                        ctx.stroke();

                        if (point.objectId) {
                            ctx.font = '12px Arial';
                            ctx.fillStyle = 'black';
                            ctx.fillText(point.objectId, point.x + 8, point.y - 8);
                        }
                    });
                }

                if (this.drawMode === 'areas' || this.areas.get(imageId).length > 0) {
                    this.areas.get(imageId).forEach(area => {
                        const points = area.points || [];
                        if (points.length > 0) {
                            ctx.beginPath();
                            ctx.moveTo(points[0].x, points[0].y);
                            for (let i = 1; i < points.length; i++) {
                                ctx.lineTo(points[i].x, points[i].y);
                            }
                            if (area.completed) {
                                ctx.closePath();
                            }
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

                            if (area.objectId && points.length > 0) {
                                ctx.font = '12px Arial';
                                ctx.fillStyle = 'black';
                                ctx.fillText(area.objectId, points[0].x + 8, points[0].y - 8);
                            }
                        }
                    });
                }
            };
        }

        saveState(imageId) {
            const pointsField = document.getElementById("Map_map_points");
            const areasField = document.getElementById("Map_map_areas");
            if (!pointsField || !areasField) {
                console.warn('Warning: Map_map_points or Map_map_areas not found');
                return;
            }
            const state = {
                points: this.points.get(imageId).map(point => ({
                    x: point.x,
                    y: point.y,
                    objectId: point.objectId
                })),
                areas: this.areas.get(imageId).map(area => ({
                    points: area.points,
                    objectId: area.objectId
                }))
            };
            pointsField.value = JSON.stringify(state.points);
            areasField.value = JSON.stringify(state.areas);
        }

        setupCanvasEvents(canvas, imageId, draw, previewContainer) {
            canvas.addEventListener('click', (event) => {
                const rect = canvas.getBoundingClientRect();
                const x = event.clientX - rect.left;
                const y = event.clientY - rect.top;

                if (this.drawMode === 'points') {
                    this.handlePointModeClick(imageId, x, y, draw, previewContainer);
                } else {
                    this.handleAreaModeClick(imageId, x, y);
                }

                draw();
                this.saveState(imageId, previewContainer);
            });

            canvas.addEventListener('contextmenu', (event) => {
                event.preventDefault();
                if (this.drawMode === 'areas') {
                    this.handleAreaModeRightClick(imageId, draw, previewContainer);
                    draw();
                    this.saveState(imageId, previewContainer);
                }
            });
        }

        handlePointModeClick(imageId, x, y, draw, previewContainer) {
            let pointRemoved = false;
            const currentPoints = this.points.get(imageId);
            for (let i = 0; i < currentPoints.length; i++) {
                const point = currentPoints[i];
                const distance = Math.sqrt(
                    Math.pow(point.x - x, 2) +
                    Math.pow(point.y - y, 2)
                );

                if (distance < 10) {
                    if (point.objectId) {
                        this.selectedObjects.delete(point.objectId);
                    }
                    currentPoints.splice(i, 1);
                    pointRemoved = true;
                    break;
                }
            }

            if (!pointRemoved) {
                this.pendingPoint = {
                    x,
                    y,
                    imageId,
                    draw,
                    previewContainer
                };
                this.showModal();
            }
        }

        handleAreaModeClick(imageId, x, y) {
            let pointRemoved = false;
            const currentAreas = this.areas.get(imageId);
            for (let i = 0; i < currentAreas.length; i++) {
                const area = currentAreas[i];
                const points = area.points || [];
                for (let j = 0; j < points.length; j++) {
                    const point = points[j];
                    const distance = Math.sqrt(
                        Math.pow(point.x - x, 2) +
                        Math.pow(point.y - y, 2)
                    );

                    if (distance < 10) {
                        points.splice(j, 1);
                        area.points = points;
                        if (points.length === 0) {
                            if (area.objectId) {
                                this.selectedObjects.delete(area.objectId);
                            }
                            currentAreas.splice(i, 1);
                        }
                        pointRemoved = true;
                        break;
                    }
                }
                if (pointRemoved) break;
            }

            if (!pointRemoved) {
                if (currentAreas.length === 0 || currentAreas[currentAreas.length - 1].completed) {
                    currentAreas.push({points: [{x, y}], completed: false});
                } else {
                    currentAreas[currentAreas.length - 1].points.push({x, y});
                }
            }
        }

        handleAreaModeRightClick(imageId, draw, previewContainer) {
            const currentAreas = this.areas.get(imageId);
            if (currentAreas.length > 0 && !currentAreas[currentAreas.length - 1].completed) {
                const areaIndex = currentAreas.length - 1;
                currentAreas[areaIndex].completed = true;
                this.pendingArea = {
                    imageId,
                    index: areaIndex,
                    draw,
                    previewContainer
                };
                this.showModal();
            }
        }
    }

    new ImageMapEditor();
})();