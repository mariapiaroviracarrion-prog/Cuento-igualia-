// Configurar la ruta del worker de PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

// Referencias DOM
const bookContainer = document.getElementById('flip-book');
const loading = document.getElementById('loading');
const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const btnRead = document.getElementById('btn-read');
const btnZoomIn = document.getElementById('btn-zoom-in');
const btnZoomOut = document.getElementById('btn-zoom-out');
const currentPageElem = document.getElementById('current-page');
const totalPagesElem = document.getElementById('total-pages');
const srAnnouncer = document.getElementById('sr-announcer');

let pageFlip = null;
let pdfDoc = null;
let pagesText = []; // Almacena el texto extraído de cada página para el lector en voz alta
let currentZoom = 1.0;
let synth = window.speechSynthesis;

// 1. Cargar automáticamente el PDF "Igualia.pdf" desde el repositorio al iniciar
document.addEventListener('DOMContentLoaded', () => {
    loadRepoPDF('Igualia.pdf');
});

async function loadRepoPDF(url) {
    loading.style.display = 'block';
    bookContainer.style.display = 'none';

    try {
        pdfDoc = await pdfjsLib.getDocument(url).promise;
        const totalPages = pdfDoc.numPages;
        totalPagesElem.textContent = totalPages;

        const firstPage = await pdfDoc.getPage(1);
        const viewportInfo = firstPage.getViewport({ scale: 1.5 });
        const pageWidth = viewportInfo.width;
        const pageHeight = viewportInfo.height;

        bookContainer.innerHTML = '';

        // Procesar páginas del PDF
        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
            const page = await pdfDoc.getPage(pageNum);
            const viewport = page.getViewport({ scale: 1.5 });

            // Extraer texto plano para síntesis de voz (TTS)
            const textContent = await page.getTextContent();
            const pageString = textContent.items.map(item => item.str).join(' ');
            pagesText.push(pageString || `Página ${pageNum} sin texto detectado.`);

            // Crear canvas para el visor de páginas
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            await page.render({ canvasContext: context, viewport: viewport }).promise;

            const pageDiv = document.createElement('div');
            pageDiv.className = 'page';
            pageDiv.setAttribute('role', 'region');
            pageDiv.setAttribute('aria-label', `Página ${pageNum}`);
            pageDiv.appendChild(canvas);

            bookContainer.appendChild(pageDiv);
        }

        // Inicializar efecto de pasar página (PageFlip)
        bookContainer.style.display = 'block';
        pageFlip = new St.PageFlip(bookContainer, {
            width: pageWidth,
            height: pageHeight,
            size: "stretch",
            minWidth: 280,
            maxWidth: pageWidth * 1.2,
            minHeight: 380,
            maxHeight: pageHeight * 1.2,
            showCover: true,
            maxShadowOpacity: 0.6,
            usePortrait: true
        });

        const pages = document.querySelectorAll('.page');
        pageFlip.loadFromHTML(pages);

        // Eventos al cambiar de página
        pageFlip.on('flip', (e) => {
            playPageTurnSound();
            if (synth.speaking) synth.cancel(); // Detener lectura si cambia la página
            updatePageInfo(e.data + 1);
        });

        updatePageInfo(1);
        loading.style.display = 'none';

    } catch (error) {
        console.error('Error al cargar Igualia.pdf:', error);
        loading.innerText = 'No se pudo cargar el archivo "Igualia.pdf". Asegúrate de que esté alojado en la raíz del repositorio.';
    }
}

// Actualizar indicadores y lector de pantalla
function updatePageInfo(pageNum) {
    currentPageElem.textContent = pageNum;
    const message = `Página ${pageNum} de ${pdfDoc ? pdfDoc.numPages : 0}`;
    announceScreenReader(message);
}

// Anuncio para lectores de pantalla (NVDA, JAWS, VoiceOver)
function announceScreenReader(text) {
    srAnnouncer.textContent = text;
}

// 5. Efecto de Sonido Sintetizado de pasar página (Web Audio API)
function playPageTurnSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const bufferSize = audioCtx.sampleRate * 0.15;
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
        }

        const noise = audioCtx.createBufferSource();
        noise.buffer = buffer;

        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1000;

        const gain = audioCtx.createGain();
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(audioCtx.destination);

        noise.start();
    } catch (e) {
        console.log("Audio no disponible o bloqueado por el navegador.");
    }
}

// 4. Botones de Navegación
btnPrev.addEventListener('click', () => {
    if (pageFlip) pageFlip.flipPrev();
});

btnNext.addEventListener('click', () => {
    if (pageFlip) pageFlip.flipNext();
});

// 3. Lectura en voz alta (Text-To-Speech en Español)
btnRead.addEventListener('click', () => {
    if (!synth) {
        alert('Tu navegador no soporta la función de lectura en voz alta.');
        return;
    }

    if (synth.speaking) {
        synth.cancel();
        btnRead.textContent = '🔊 Leer Página';
        return;
    }

    const currentPageIndex = pageFlip ? pageFlip.getCurrentPageIndex() : 0;
    const textToRead = pagesText[currentPageIndex];

    if (textToRead) {
        const utterance = new SpeechSynthesisUtterance(textToRead);
        utterance.lang = 'es-ES'; // Lectura en Español
        utterance.rate = 0.9; // Velocidad pausada idónea para baja visión y aprendizaje

        utterance.onstart = () => {
            btnRead.textContent = '⏹️ Detener Lectura';
            announceScreenReader("Iniciando lectura en voz alta.");
        };

        utterance.onend = () => {
            btnRead.textContent = '🔊 Leer Página';
        };

        synth.speak(utterance);
    }
});

// 8. Botones para Agrandar y Achicar Vista / Texto
btnZoomIn.addEventListener('click', () => {
    if (currentZoom < 1.5) {
        currentZoom += 0.1;
        applyZoom();
    }
});

btnZoomOut.addEventListener('click', () => {
    if (currentZoom > 0.7) {
        currentZoom -= 0.1;
        applyZoom();
    }
});

function applyZoom() {
    bookContainer.style.transform = `scale(${currentZoom})`;
    bookContainer.style.transformOrigin = 'top center';
    announceScreenReader(`Escala ajustada al ${Math.round(currentZoom * 100)} por ciento`);
}

// Control por teclado para mayor accesibilidad
document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') {
        if (pageFlip) pageFlip.flipNext();
    } else if (e.key === 'ArrowLeft') {
        if (pageFlip) pageFlip.flipPrev();
    }
});