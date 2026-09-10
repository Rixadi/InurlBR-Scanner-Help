// fluid simulation in ascii
// using Jos Stam's "Real-Time Fluid Dynamics for Games"
// https://www.dgp.toronto.edu/people/stam/reality/Research/pdf/GDC03.pdfd
// https://mikeash.com/pyblog/fluid-simulation-for-dummies.html

window.addEventListener('load', () => {

const artPreElement = document.getElementById('artpre');

// =====================================================================
// 1. Mede o tamanho REAL de uma célula de caractere do overlay.
// =====================================================================
const artStyles = window.getComputedStyle(artPreElement);
const FONT_SCALE = 0.6;

const overlayFontSize   = parseFloat(artStyles.fontSize)   * FONT_SCALE;
const overlayLineHeight = parseFloat(artStyles.lineHeight) * FONT_SCALE;
const overlayFontFamily = artStyles.fontFamily;

const measureEl = document.createElement('pre');
measureEl.style.cssText =
    'position:absolute;visibility:hidden;margin:0;padding:0;' +
    'font-family:' + overlayFontFamily + ';' +
    'font-size:'   + overlayFontSize   + 'px;' +
    'line-height:' + overlayLineHeight + 'px;' +
    'white-space:pre;';
measureEl.textContent = 'M'.repeat(100) + '\nM';
document.body.appendChild(measureEl);
const CELL_WIDTH  = measureEl.getBoundingClientRect().width  / 100;
const CELL_HEIGHT = measureEl.getBoundingClientRect().height / 2;
document.body.removeChild(measureEl);

// =====================================================================
// 2. Grade = tela inteira (em células de caractere)
// =====================================================================
const SCALED_WIDTH  = Math.ceil(window.innerWidth  / CELL_WIDTH)  + 1;
const SCALED_HEIGHT = Math.ceil(window.innerHeight / CELL_HEIGHT) + 1;

console.log('Fluid grid dimensions (full screen):', SCALED_WIDTH, 'x', SCALED_HEIGHT, '=', SCALED_WIDTH * SCALED_HEIGHT, 'cells');

// =====================================================================
// 3. Lê #artpre (no HTML atual só tem espaços → nenhum sólido)
// =====================================================================
const tempArtElement = artPreElement;
const tempArtText  = tempArtElement.textContent || '';
const tempArtLines = tempArtText.split('\n');
const WIDTH  = tempArtLines.reduce((m, l) => Math.max(m, l.length), 0);
const HEIGHT = tempArtLines.length;

const artGridW = Math.max(1, Math.floor(WIDTH  / FONT_SCALE));
const artGridH = Math.max(1, Math.floor(HEIGHT / FONT_SCALE));
const ART_OFFSET_X = Math.max(0, Math.floor((SCALED_WIDTH  - artGridW) / 2));
const ART_OFFSET_Y = Math.max(0, Math.floor((SCALED_HEIGHT - artGridH) / 2));


// =====================================================================
// Fluid Simulation Code
// =====================================================================

const SCALE = 1;
const iter = 4;
const dt = 0.01;
const diffusion = 0.00000001;
const viscosity = 0.00000010;

function IX(x, y) {
    x = Math.max(0, Math.min(SCALED_WIDTH - 1, Math.floor(x)));
    y = Math.max(0, Math.min(SCALED_HEIGHT - 1, Math.floor(y)));
    return x + y * SCALED_WIDTH;
}

class FluidCube {
    constructor(dt, diffusion, viscosity) {
        this.width = SCALED_WIDTH;
        this.height = SCALED_HEIGHT;
        this.dt = dt;
        this.diff = diffusion;
        this.visc = viscosity;

        const size = SCALED_WIDTH * SCALED_HEIGHT;
        this.s = new Float32Array(size).fill(0);
        this.density = new Float32Array(size).fill(0);

        this.Vx = new Float32Array(size).fill(0);
        this.Vy = new Float32Array(size).fill(0);

        this.Vx0 = new Float32Array(size).fill(0);
        this.Vy0 = new Float32Array(size).fill(0);
    }

    addDensity(x, y, amount) {
        this.density[IX(x, y)] += amount;
    }

    addVelocity(x, y, amountX, amountY) {
        let index = IX(x, y);
        this.Vx[index] += amountX;
        this.Vy[index] += amountY;
    }

    step() {
        const visc = this.visc;
        const diff = this.diff;
        const Vx = this.Vx;
        const Vy = this.Vy;
        const Vx0 = this.Vx0;
        const Vy0 = this.Vy0;
        const s = this.s;
        const density = this.density;

        this.diffuse(1, Vx0, Vx, visc, iter);
        this.diffuse(2, Vy0, Vy, visc, iter);

        this.project(Vx0, Vy0, Vx, Vy);

        this.advect(1, Vx, Vx0, Vx0, Vy0);
        this.advect(2, Vy, Vy0, Vx0, Vy0);

        this.project(Vx, Vy, Vx0, Vy0);

        this.diffuse(0, s, density, diff, iter);

        this.advect(0, density, s, Vx, Vy);
    }

    lin_solve(b, x, x0, a, cRecip, iter) {
        const width = this.width;
        const height = this.height;
        const widthMinus1 = width - 1;
        const heightMinus1 = height - 1;

        for (let k = 0; k < iter; k++) {
            for (let j = 1; j < widthMinus1; j++) {
                for (let i = 1; i < heightMinus1; i++) {
                    const index = j + i * width;

                    if (!activeMap[index]) continue;

                    if (solidMap[index]) {
                        x[index] = 0;
                        continue;
                    }

                    const idxRight  = (j + 1) + i * width;
                    const idxLeft   = (j - 1) + i * width;
                    const idxTop    = j + (i + 1) * width;
                    const idxBottom = j + (i - 1) * width;

                    x[index] =
                        (x0[index] +
                            a * (x[idxRight] +
                                 x[idxLeft] +
                                 x[idxTop] +
                                 x[idxBottom]
                                )) * cRecip;
                }
            }
            this.set_bnd(b, x);
        }
    }

    diffuse(b, x, x0, diff, iter) {
        const widthMinus2 = this.width - 2;
        const heightMinus2 = this.height - 2;
        const a = this.dt * diff * widthMinus2 * heightMinus2;
        const cRecip = 1.0 / (1 + 4 * a);
        if (a === 0 || cRecip === Infinity || cRecip !== cRecip) {
            const width = this.width;
            const height = this.height;
            for (let j = 1; j < width - 1; j++) {
                for (let i = 1; i < height - 1; i++) {
                    const index = j + i * width;
                    x[index] = x0[index];
                }
            }
            this.set_bnd(b, x);
        } else {
            this.lin_solve(b, x, x0, a, cRecip, iter);
        }
    }

    advect(b, d, d0, velocX, velocY) {
        let i0, i1, j0, j1;

        const width = this.width;
        const height = this.height;
        const widthMinus1 = width - 1;
        const heightMinus1 = height - 1;
        const widthMinus2 = width - 2;
        const heightMinus2 = height - 2;

        const dtx = this.dt * widthMinus2;
        const dty = this.dt * heightMinus2;

        let s0, s1, t0, t1;
        let tmp1, tmp2, x, y;

        const NfloatW = width;
        const NfloatH = height;
        const NfloatWMinus1_5 = width - 1.5;
        const NfloatHMinus1_5 = height - 1.5;

        for (let j = 1; j < widthMinus1; j++) {
            for (let i = 1; i < heightMinus1; i++) {
                const index = j + i * width;

                if (!activeMap[index]) {
                    d[index] = d0[index] * 0.99;
                    continue;
                }

                if (solidMap[index]) {
                    d[index] = 0;
                    continue;
                }

                tmp1 = dtx * velocX[index];
                tmp2 = dty * velocY[index];
                x = j - tmp1;
                y = i - tmp2;

                x = x < 0.5 ? 0.5 : (x > NfloatWMinus1_5 ? NfloatWMinus1_5 : x);
                y = y < 0.5 ? 0.5 : (y > NfloatHMinus1_5 ? NfloatHMinus1_5 : y);

                j0 = Math.floor(x);
                j1 = j0 + 1;
                i0 = Math.floor(y);
                i1 = i0 + 1;

                const idx00 = j0 + i0 * width;
                const idx01 = j0 + i1 * width;
                const idx10 = j1 + i0 * width;
                const idx11 = j1 + i1 * width;

                if (solidMap[idx00] || solidMap[idx01] || solidMap[idx10] || solidMap[idx11]) {
                    const fromX = j + tmp1;
                    const fromY = i + tmp2;

                    let reflectedX = x;
                    let reflectedY = y;

                    if (solidMap[idx00] || solidMap[idx10]) {
                        reflectedX = j + (j - x);
                    }
                    if (solidMap[idx00] || solidMap[idx01]) {
                        reflectedY = i + (i - y);
                    }

                    reflectedX = reflectedX < 0.5 ? 0.5 : (reflectedX > NfloatWMinus1_5 ? NfloatWMinus1_5 : reflectedX);
                    reflectedY = reflectedY < 0.5 ? 0.5 : (reflectedY > NfloatHMinus1_5 ? NfloatHMinus1_5 : reflectedY);

                    j0 = Math.floor(reflectedX);
                    j1 = j0 + 1;
                    i0 = Math.floor(reflectedY);
                    i1 = i0 + 1;

                    const ridx00 = j0 + i0 * width;
                    const ridx01 = j0 + i1 * width;
                    const ridx10 = j1 + i0 * width;
                    const ridx11 = j1 + i1 * width;

                    if (solidMap[ridx00] || solidMap[ridx01] || solidMap[ridx10] || solidMap[ridx11]) {
                        d[index] = d0[index] * 0.95;
                        continue;
                    }

                    s1 = reflectedX - j0;
                    s0 = 1.0 - s1;
                    t1 = reflectedY - i0;
                    t0 = 1.0 - t1;

                    d[index] =
                        s0 * (t0 * d0[ridx00] + t1 * d0[ridx01]) +
                        s1 * (t0 * d0[ridx10] + t1 * d0[ridx11]);
                    continue;
                }

                s1 = x - j0;
                s0 = 1.0 - s1;
                t1 = y - i0;
                t0 = 1.0 - t1;

                d[index] =
                    s0 * (t0 * d0[idx00] + t1 * d0[idx01]) +
                    s1 * (t0 * d0[idx10] + t1 * d0[idx11]);
            }
        }
        this.set_bnd(b, d);
    }

    project(velocX, velocY, p, div) {
        const width = this.width;
        const height = this.height;
        const widthMinus1 = width - 1;
        const heightMinus1 = height - 1;

        for (let j = 1; j < widthMinus1; j++) {
            for (let i = 1; i < heightMinus1; i++) {
                const index = j + i * width;

                if (!activeMap[index]) {
                    div[index] = 0;
                    p[index] = 0;
                    continue;
                }

                if (solidMap[index]) {
                    div[index] = 0;
                    p[index] = 0;
                    continue;
                }

                const idxRight  = (j + 1) + i * width;
                const idxLeft   = (j - 1) + i * width;
                const idxTop    = j + (i + 1) * width;
                const idxBottom = j + (i - 1) * width;

                div[index] = -0.5 * (velocX[idxRight] - velocX[idxLeft] +
                                     velocY[idxTop]   - velocY[idxBottom]);
                p[index] = 0;
            }
        }
        this.set_bnd(0, div);
        this.set_bnd(0, p);

        this.lin_solve(0, p, div, 1, 1.0 / 4.0, iter);

        for (let j = 1; j < widthMinus1; j++) {
            for (let i = 1; i < heightMinus1; i++) {
                const index = j + i * width;

                if (!activeMap[index]) continue;

                if (solidMap[index]) {
                    velocX[index] = 0;
                    velocY[index] = 0;
                    continue;
                }

                const idxRight  = (j + 1) + i * width;
                const idxLeft   = (j - 1) + i * width;
                const idxTop    = j + (i + 1) * width;
                const idxBottom = j + (i - 1) * width;

                velocX[index] -= 0.5 * (p[idxRight] - p[idxLeft]);
                velocY[index] -= 0.5 * (p[idxTop]   - p[idxBottom]);
            }
        }
        this.set_bnd(1, velocX);
        this.set_bnd(2, velocY);
    }

    set_bnd(b, x) {
        const width = this.width;
        const height = this.height;
        const widthMinus1 = width - 1;
        const heightMinus1 = height - 1;
        const widthMinus2 = width - 2;
        const heightMinus2 = height - 2;

        for (let j = 1; j < widthMinus1; j++) {
            const idxTop = j + 0 * width;
            const idxTopInner = j + 1 * width;
            const idxBottom = j + heightMinus1 * width;
            const idxBottomInner = j + heightMinus2 * width;

            if (!solidMap[idxTop]) {
                x[idxTop] = b === 2 ? -x[idxTopInner] : x[idxTopInner];
            } else {
                x[idxTop] = 0;
            }
            if (!solidMap[idxBottom]) {
                x[idxBottom] = b === 2 ? -x[idxBottomInner] : x[idxBottomInner];
            } else {
                x[idxBottom] = 0;
            }
        }
        for (let i = 1; i < heightMinus1; i++) {
            const iWidth = i * width;
            const idxLeft = 0 + iWidth;
            const idxLeftInner = 1 + iWidth;
            const idxRight = widthMinus1 + iWidth;
            const idxRightInner = widthMinus2 + iWidth;

            if (!solidMap[idxLeft]) {
                x[idxLeft] = b === 1 ? -x[idxLeftInner] : x[idxLeftInner];
            } else {
                x[idxLeft] = 0;
            }
            if (!solidMap[idxRight]) {
                x[idxRight] = b === 1 ? -x[idxRightInner] : x[idxRightInner];
            } else {
                x[idxRight] = 0;
            }
        }

        const idx00 = 0;
        const idx01 = width;
        const idx10 = 1;
        if (!solidMap[idx00]) {
            x[idx00] = 0.5 * (x[idx10] + x[idx01]);
        } else {
            x[idx00] = 0;
        }

        const idx0H = heightMinus1 * width;
        const idx0HInner = 1 + idx0H;
        const idx0HInner2 = (heightMinus2) * width;
        if (!solidMap[idx0H]) {
            x[idx0H] = 2.5 * (x[idx0HInner] + x[idx0HInner2]);
        } else {
            x[idx0H] = 0;
        }

        const idxW0 = widthMinus1;
        const idxW0Inner = widthMinus2;
        const idxW01 = widthMinus1 + width;
        if (!solidMap[idxW0]) {
            x[idxW0] = 0.5 * (x[idxW0Inner] + x[idxW01]);
        } else {
            x[idxW0] = 0;
        }

        const idxWH = widthMinus1 + idx0H;
        const idxWHInner1 = widthMinus2 + idx0H;
        const idxWHInner2 = widthMinus1 + idx0HInner2;
        if (!solidMap[idxWH]) {
            x[idxWH] = 0.5 * (x[idxWHInner1] + x[idxWHInner2]);
        } else {
            x[idxWH] = 0;
        }

        for (let j = 1; j < widthMinus1; j++) {
            for (let i = 1; i < heightMinus1; i++) {
                const idx = j + i * width;
                if (solidMap[idx]) {
                    x[idx] = 0;
                }
            }
        }
    }
}


const fluid = new FluidCube(dt, diffusion, viscosity);

const solidMap  = new Array(SCALED_WIDTH * SCALED_HEIGHT).fill(false);
const activeMap = new Array(SCALED_WIDTH * SCALED_HEIGHT).fill(false);
const ACTIVITY_THRESHOLD = 0.005;

// Decay global da densidade — o "branco" some aos poucos
const DENSITY_DECAY = 0.993;

function updateActiveCells() {
    const width = SCALED_WIDTH;
    const height = SCALED_HEIGHT;
    const size = width * height;

    activeMap.fill(false);

    for (let i = 0; i < size; i++) {
        const density = fluid.density[i];
        const vx = fluid.Vx[i];
        const vy = fluid.Vy[i];
        const hasSignificantDensity = density > ACTIVITY_THRESHOLD;
        const hasSignificantVelocity = (vx > ACTIVITY_THRESHOLD || vx < -ACTIVITY_THRESHOLD) ||
                                       (vy > ACTIVITY_THRESHOLD || vy < -ACTIVITY_THRESHOLD);

        if (hasSignificantDensity || hasSignificantVelocity || solidMap[i]) {
            activeMap[i] = true;

            const x = i % width;
            const y = (i - x) / width;

            const hasLeft   = x > 0;
            const hasRight  = x < width - 1;
            const hasTop    = y > 0;
            const hasBottom = y < height - 1;

            if (hasTop) {
                if (hasLeft)  activeMap[i - width - 1] = true;
                activeMap[i - width] = true;
                if (hasRight) activeMap[i - width + 1] = true;
            }
            if (hasLeft)  activeMap[i - 1] = true;
            if (hasRight) activeMap[i + 1] = true;
            if (hasBottom) {
                if (hasLeft)  activeMap[i + width - 1] = true;
                activeMap[i + width] = true;
                if (hasRight) activeMap[i + width + 1] = true;
            }
        }
    }
}

function parseArtForSolids() {
    const solids = [];
    const dropPoints = [];

    for (let y = 0; y < HEIGHT && y < tempArtLines.length; y++) {
        for (let x = 0; x < WIDTH && x < tempArtLines[y].length; x++) {
            const char = tempArtLines[y][x];

            if (char && char !== ' ' && char !== '\t' && char !== '\n' && char !== '\r') {
                const scaledX = Math.floor(x / FONT_SCALE) + ART_OFFSET_X;
                const scaledY = Math.floor((HEIGHT - 1 - y) / FONT_SCALE) + ART_OFFSET_Y;

                if (scaledX < 0 || scaledX >= SCALED_WIDTH ||
                    scaledY < 0 || scaledY >= SCALED_HEIGHT) {
                    continue;
                }

                if (char === '°') {
                    dropPoints.push({ x: scaledX, y: scaledY });
                } else {
                    solids.push({ x: scaledX, y: scaledY });
                    solidMap[IX(scaledX, scaledY)] = true;
                }
            }
        }
    }

    return { solids, dropPoints };
}

function enforceSolidConstraints() {
    const width = SCALED_WIDTH;
    const height = SCALED_HEIGHT;
    const widthMinus1 = width - 1;
    const heightMinus1 = height - 1;

    for (let j = 1; j < widthMinus1; j++) {
        for (let i = 1; i < heightMinus1; i++) {
            const index = j + i * width;

            if (!activeMap[index]) continue;

            if (solidMap[index]) {
                fluid.Vx[index] = 0;
                fluid.Vy[index] = 0;
                fluid.Vx0[index] = 0;
                fluid.Vy0[index] = 0;
                fluid.density[index] = 0;
                fluid.s[index] = 0;
                continue;
            }

            const idxLeft   = (j - 1) + i * width;
            const idxRight  = (j + 1) + i * width;
            const idxBottom = j + (i - 1) * width;
            const idxTop    = j + (i + 1) * width;
            const leftSolid   = solidMap[idxLeft];
            const rightSolid  = solidMap[idxRight];
            const bottomSolid = solidMap[idxBottom];
            const topSolid    = solidMap[idxTop];

            if (leftSolid && fluid.Vx[index] < 0) {
                fluid.Vx[index] = -fluid.Vx[index] * 0.8;
                fluid.density[index] += Math.abs(fluid.Vx[index]) * 0.3;
            }
            if (rightSolid && fluid.Vx[index] > 0) {
                fluid.Vx[index] = -fluid.Vx[index] * 0.8;
                fluid.density[index] += Math.abs(fluid.Vx[index]) * 0.3;
            }
            if (bottomSolid && fluid.Vy[index] < 0) {
                fluid.Vy[index] = -fluid.Vy[index] * 0.8;
                fluid.density[index] += Math.abs(fluid.Vy[index]) * 0.3;
            }
            if (topSolid && fluid.Vy[index] > 0) {
                fluid.Vy[index] = -fluid.Vy[index] * 0.8;
                fluid.density[index] += Math.abs(fluid.Vy[index]) * 0.3;
            }

            if ((leftSolid || rightSolid) && (topSolid || bottomSolid)) {
                fluid.Vx[index] = -fluid.Vx[index] * 0.6;
                fluid.Vy[index] = -fluid.Vy[index] * 0.6;
                fluid.density[index] += Math.abs(fluid.Vx[index]) * 0.3;
                fluid.density[index] += Math.abs(fluid.Vy[index]) * 0.3;
            }
        }
    }
}

const { solids: artSolids, dropPoints } = parseArtForSolids();

function addRandomDrop() {
    if (dropPoints.length === 0) return;

    const dropPoint = dropPoints[Math.floor(Math.random() * dropPoints.length)];
    const dropIndex = dropPoint.x + dropPoint.y * SCALED_WIDTH;
    if (!solidMap[dropIndex]) {
        fluid.addDensity(dropPoint.x, dropPoint.y, 12.0);
        fluid.addVelocity(dropPoint.x, dropPoint.y, 0, -12);
    }
}

// =====================================================================
// Visualização: overlays ASCII coloridos com glow
// =====================================================================
const createDensityOverlays = () => {
    tempArtElement.parentElement.style.position = 'relative';

    const densityLayers = [
        {
            minDensity: 0,
            maxDensity: 0.15,
            color: 'rgba(255, 150, 110, 0.75)',
            chars: " .'`^\",:;Il!i"
        },
        {
            minDensity: 0.15,
            maxDensity: 0.40,
            color: 'rgba(255, 90, 70, 0.90)',
            chars: "><~+_-?][}{1)("
        },
        {
            minDensity: 0.40,
            maxDensity: 0.70,
            color: 'rgba(255, 45, 58, 1)',
            chars: "|\\/tfjrxnuvczXYUJCLQ0O"
        },
        {
            minDensity: 0.70,
            maxDensity: 1.0,
            color: 'rgba(255, 210, 210, 1)',
            chars: "Zmwqpdbkhao*#MW&8%B@$"
        }
    ];

    const overlays = [];

    densityLayers.forEach((layer, index) => {
        const overlay = document.createElement('pre');
        overlay.id = `fluidOverlay${index}`;

        overlay.style.position = 'fixed';
        overlay.style.top = '0px';
        overlay.style.left = '0px';
        overlay.style.width = '100vw';
        overlay.style.height = '100vh';
        overlay.style.background = 'transparent';
        overlay.style.color = layer.color;
        overlay.style.fontFamily = overlayFontFamily;
        overlay.style.fontSize   = overlayFontSize   + 'px';
        overlay.style.lineHeight = overlayLineHeight + 'px';
        overlay.style.margin = '0';
        overlay.style.padding = '0';
        overlay.style.pointerEvents = 'none';
        overlay.style.whiteSpace = 'pre';
        overlay.style.overflow = 'hidden';
        overlay.style.zIndex = `${index}`;
        overlay.style.textShadow = `0 0 6px ${layer.color}`;

        tempArtElement.parentElement.appendChild(overlay);
        overlays.push({ element: overlay, layer: layer });
    });

    return overlays;
};

const fluidOverlays = createDensityOverlays();

// =====================================================================
// Mouse: rastreia posição
// =====================================================================
let lastMouseX = -1;
let lastMouseY = -1;

function toGrid(clientX, clientY) {
    const gridX = Math.floor((clientX / window.innerWidth)  * SCALED_WIDTH);
    const visualGridY = Math.floor((clientY / window.innerHeight) * SCALED_HEIGHT);
    const gridY = SCALED_HEIGHT - 1 - visualGridY;
    return { gridX, gridY };
}

function handleMouseMove(e) {
    const x = e.clientX;
    const y = e.clientY;

    if (x < 0 || x > window.innerWidth || y < 0 || y > window.innerHeight) {
        lastMouseX = -1;
        lastMouseY = -1;
        return;
    }

    const { gridX, gridY } = toGrid(x, y);

    if (lastMouseX !== -1 && lastMouseY !== -1) {
        const dx = x - lastMouseX;
        const dy = y - lastMouseY;

        const force = 0.08;
        const velX = dx * force;
        const velY = -dy * force;

        addForce(gridX, gridY, velX, velY, 1);
    }

    lastMouseX = x;
    lastMouseY = y;
}

function addForce(cx, cy, vx, vy, r) {
    for (let i = -r; i <= r; i++) {
        for (let j = -r; j <= r; j++) {
            const x = cx + i;
            const y = cy + j;

            if (x >= 0 && x < SCALED_WIDTH && y >= 0 && y < SCALED_HEIGHT) {
                const index = x + y * SCALED_WIDTH;
                if (!solidMap[index]) {
                    fluid.addVelocity(x, y, vx, vy);
                    const speed = Math.sqrt(vx*vx + vy*vy);
                    fluid.addDensity(x, y, Math.min(speed * 0.12, 1.5));
                }
            }
        }
    }
}

// --- CLIQUE: burst radial (forte) ---
function handleMouseDown(e) {
    if (e.target.closest('a, button, input, textarea, select, .menu, .dork, .btn, .tog, .opt, .p')) {
        return;
    }

    const x = e.clientX;
    const y = e.clientY;
    if (x < 0 || x > window.innerWidth || y < 0 || y > window.innerHeight) return;

    const { gridX, gridY } = toGrid(x, y);

    const radius   = 14;
    const strength = 55;
    const densCore = 30;

    if (gridX >= 0 && gridX < SCALED_WIDTH && gridY >= 0 && gridY < SCALED_HEIGHT) {
        const coreIdx = gridX + gridY * SCALED_WIDTH;
        if (!solidMap[coreIdx]) {
            fluid.density[coreIdx] += densCore;
        }
    }

    for (let i = -radius; i <= radius; i++) {
        for (let j = -radius; j <= radius; j++) {
            const gx = gridX + i;
            const gy = gridY + j;
            if (gx < 1 || gx >= SCALED_WIDTH - 1 || gy < 1 || gy >= SCALED_HEIGHT - 1) continue;

            const idx = gx + gy * SCALED_WIDTH;
            if (solidMap[idx]) continue;

            const distSq = i*i + j*j;
            if (distSq > radius * radius) continue;

            const dist = Math.sqrt(distSq) || 1;
            const falloff = 1 - dist / radius;
            const nx = i / dist;
            const ny = j / dist;

            fluid.Vx[idx] += nx * strength * falloff;
            fluid.Vy[idx] += ny * strength * falloff;

            fluid.density[idx] += falloff * falloff * 6;
        }
    }
}

document.addEventListener('mousemove', handleMouseMove);
document.addEventListener('mousedown', handleMouseDown);

// =====================================================================
// Burst pequeno reutilizável (scroll / teclado)
// =====================================================================
function miniBurst(cx, cy, vx, vy, radius, densityAmount) {
    const dens = densityAmount !== undefined ? densityAmount : 0.6;
    for (let i = -radius; i <= radius; i++) {
        for (let j = -radius; j <= radius; j++) {
            const gx = cx + i;
            const gy = cy + j;
            if (gx < 1 || gx >= SCALED_WIDTH - 1 || gy < 1 || gy >= SCALED_HEIGHT - 1) continue;

            const idx = gx + gy * SCALED_WIDTH;
            if (solidMap[idx]) continue;

            const distSq = i*i + j*j;
            if (distSq > radius * radius) continue;

            const falloff = 1 - Math.sqrt(distSq) / radius;

            fluid.Vx[idx] += vx * falloff;
            fluid.Vy[idx] += vy * falloff;
            fluid.density[idx] += falloff * dens;
        }
    }
}

// =====================================================================
// SCROLL: gotículas aleatórias pela tela
// =====================================================================
let lastScrollTime = 0;

window.addEventListener('wheel', (e) => {
    const now = performance.now();
    if (now - lastScrollTime < 50) return;
    lastScrollTime = now;

    const dy = e.deltaY;
    const dx = e.deltaX;
    if (Math.abs(dy) < 0.5 && Math.abs(dx) < 0.5) return;

    const dirY = dy > 0 ? 1 : (dy < 0 ? -1 : 0);
    const dirX = dx > 0 ? 1 : (dx < 0 ? -1 : 0);

    const PUSH   = 2.0;
    const RADIUS = 3;
    const N = 3;

    for (let k = 0; k < N; k++) {
        const rx = 4 + Math.floor(Math.random() * (SCALED_WIDTH  - 8));
        const ry = 4 + Math.floor(Math.random() * (SCALED_HEIGHT - 8));

        const jitterX = (Math.random() - 0.5) * 1.5;
        const jitterY = (Math.random() - 0.5) * 1.5;

        miniBurst(
            rx, ry,
            dirX * PUSH + jitterX,
            dirY * PUSH + jitterY,
            RADIUS
        );
    }
}, { passive: true });

// =====================================================================
// TECLADO: mesmo efeito do scroll
// =====================================================================
window.addEventListener('keydown', (e) => {
    if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') return;

    const PUSH   = 2.0;
    const RADIUS = 3;
    const N = 2;

    for (let k = 0; k < N; k++) {
        const rx = 4 + Math.floor(Math.random() * (SCALED_WIDTH  - 8));
        const ry = 4 + Math.floor(Math.random() * (SCALED_HEIGHT - 8));

        const angle = Math.random() * Math.PI * 2;
        const speed = PUSH * (0.6 + Math.random() * 0.8);

        miniBurst(
            rx, ry,
            Math.cos(angle) * speed,
            Math.sin(angle) * speed,
            RADIUS
        );
    }
});

// =====================================================================
// ENTRADA DA LOGO PWED404:
// a logo começa invisível e cada caractere aparece no MESMO instante
// em que o fluido injeta a célula correspondente. Vira uma "impressão".
// =====================================================================
const bannerEl = document.querySelector('pre.banner');

// Esconde a logo IMEDIATAMENTE para não aparecer antes do efeito
if (bannerEl) {
    bannerEl.style.opacity = '0';
}

function injectLogoEntrance() {
    if (!bannerEl) return;

    // Guarda o texto original ANTES de mexer no DOM
    const originalText = bannerEl.textContent || '';
    const lines = originalText.split('\n');
    if (lines.length === 0) return;

    // Limpa e reconstrói o banner caractere-a-caractere com spans
    bannerEl.textContent = '';
    const spansByRow = [];
    for (let row = 0; row < lines.length; row++) {
        const line = lines[row];
        const rowSpans = [];
        for (let col = 0; col < line.length; col++) {
            const ch = line[col];
            if (ch === ' ' || ch === '\t' || ch === '\r') {
                // Espaços: só texto normal, não precisam aparecer
                bannerEl.appendChild(document.createTextNode(ch));
                rowSpans.push(null);
            } else {
                const span = document.createElement('span');
                span.textContent = ch;
                span.style.opacity = '0';
                span.style.transition = 'opacity 220ms ease-out';
                span.style.display = 'inline';
                bannerEl.appendChild(span);
                rowSpans.push(span);
            }
        }
        if (row < lines.length - 1) {
            bannerEl.appendChild(document.createTextNode('\n'));
        }
        spansByRow.push(rowSpans);
    }

    // Torna o banner "existente" — os spans começam invisíveis
    bannerEl.style.opacity = '1';

    // Agora mede a posição na tela pra converter em coordenadas da grade
    const rect = bannerEl.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const maxLineLen = Math.max(...lines.map(l => l.length), 1);
    const charW = rect.width  / maxLineLen;
    const lineH = rect.height / lines.length;

    // Coleta todas as células (char por char) com referência ao span
    const cells = [];
    for (let row = 0; row < lines.length; row++) {
        const line = lines[row];
        for (let col = 0; col < line.length; col++) {
            const ch = line[col];
            if (ch === ' ' || ch === '\t' || ch === '\r') continue;

            const screenX = rect.left + col * charW + charW * 0.5;
            const screenY = rect.top  + row * lineH + lineH * 0.5;

            const gx = Math.floor((screenX / window.innerWidth)  * SCALED_WIDTH);
            const gyVis = Math.floor((screenY / window.innerHeight) * SCALED_HEIGHT);
            const gy = SCALED_HEIGHT - 1 - gyVis;

            cells.push({ gx, gy, span: spansByRow[row][col] });
        }
    }

    if (cells.length === 0) return;

    // Embaralha para o reveal ser orgânico
    for (let i = cells.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [cells[i], cells[j]] = [cells[j], cells[i]];
    }

    // Injeta progressivamente ao longo de ~1s (~60 frames)
    const perFrame = Math.max(1, Math.ceil(cells.length / 60));
    let cursor = 0;

    function step() {
        for (let n = 0; n < perFrame && cursor < cells.length; n++, cursor++) {
            const { gx, gy, span } = cells[cursor];

            // 1) Fluido: injeta densidade se a célula está dentro da grade
            if (gx >= 1 && gx < SCALED_WIDTH - 1 && gy >= 1 && gy < SCALED_HEIGHT - 1) {
                const idx = gx + gy * SCALED_WIDTH;
                if (!solidMap[idx]) {
                    fluid.density[idx] += 20 + Math.random() * 15;
                    fluid.Vx[idx] += (Math.random() - 0.5) * 1.2;
                    fluid.Vy[idx] += (Math.random() - 0.5) * 1.2;
                }
            }

            // 2) Logo: revela o caractere correspondente
            if (span) span.style.opacity = '1';
        }
        if (cursor < cells.length) requestAnimationFrame(step);
    }
    step();
}

// =====================================================================
// Fade global da densidade (o "branco" some aos poucos)
// =====================================================================
function applyDensityDecay() {
    const arr = fluid.density;
    const size = arr.length;
    for (let i = 0; i < size; i++) {
        const d = arr[i];
        if (d > 0.0001) {
            arr[i] = d * DENSITY_DECAY;
        } else if (d !== 0) {
            arr[i] = 0;
        }
    }
}

// =====================================================================
// Loop de animação
// =====================================================================
let frameCount = 0;
let maxDensitySeen = 0;

function animate() {
    requestAnimationFrame(animate);

    if (Math.random() < 0.6) {
        addRandomDrop();
    }

    updateActiveCells();
    enforceSolidConstraints();
    fluid.step();

    applyDensityDecay();
    enforceSolidConstraints();

    frameCount++;
    if (frameCount % 60 === 0) {
        maxDensitySeen = 0;
        const activeCells = activeMap.reduce((count, active) => count + (active ? 1 : 0), 0);
        console.log(`Active cells: ${activeCells}/${activeMap.length} (${(activeCells/activeMap.length*100).toFixed(1)}%)`);
    }

    const width = SCALED_WIDTH;
    const height = SCALED_HEIGHT;
    const densityArray = fluid.density;
    const densityScale = 1.0 / 1.4;
    const isLastLayer = fluidOverlays.length - 1;

    fluidOverlays.forEach((overlayData, layerIndex) => {
        const layer = overlayData.layer;
        const layerChars = layer.chars;
        const charsLengthMinus1 = layerChars.length - 1;
        const layerRange = layer.maxDensity - layer.minDensity;
        const layerRangeRecip = 1.0 / layerRange;
        const isLast = layerIndex === isLastLayer;
        const minDensity = layer.minDensity;
        const maxDensity = layer.maxDensity;

        let asciiString = "";

        for (let i = height - 1; i >= 0; i--) {
            for (let j = 0; j < width; j++) {
                const index = j + i * width;

                if (!activeMap[index]) {
                    asciiString += ' ';
                    continue;
                }

                const densityValue = densityArray[index];

                if (densityValue !== densityValue || densityValue === undefined) {
                    asciiString += ' ';
                    continue;
                }

                if (densityValue > maxDensitySeen) {
                    maxDensitySeen = densityValue;
                }

                const normalizedDensity = densityValue * densityScale;
                const clampedDensity = normalizedDensity < 0 ? 0 : (normalizedDensity > 1 ? 1 : normalizedDensity);

                const isInRange = isLast
                    ? (clampedDensity >= minDensity && clampedDensity <= maxDensity)
                    : (clampedDensity >= minDensity && clampedDensity <  maxDensity);

                if (isInRange) {
                    const densityInLayer = (clampedDensity - minDensity) * layerRangeRecip;
                    const charIndex = Math.floor(densityInLayer * charsLengthMinus1);
                    const safeCharIndex = charIndex < 0 ? 0 : (charIndex > charsLengthMinus1 ? charsLengthMinus1 : charIndex);
                    const char = layerChars[safeCharIndex];
                    asciiString += char !== undefined ? char : ' ';
                } else {
                    asciiString += ' ';
                }
            }
            asciiString += '\n';
        }

        overlayData.element.textContent = asciiString;
    });
}

animate();

// Dispara a entrada da logo um tico depois, pra dar tempo do layout
// assentar (fontes, reflow) e o usuário perceber o efeito acontecendo.
setTimeout(injectLogoEntrance, 350);

});