// De confetti in het kopvlak, getekend met een fragment shader (WebGL), overgenomen uit docs/visueel/kopvlak.js: een halftoonraster, een
// serpentine, drie lagen confetti en een fijne korrel, in de themakleuren confetti-1/2/3. Rechts dicht en links leeg, zodat titel en
// datum schoon blijven. Het beeld is statisch (één keer getekend, opnieuw bij een andere breedte, een ander lettertype of een ander
// thema). Puur versiering. Zonder WebGL geeft `tekenConfetti` niets terug en blijft de CSS-confetti van het kopvlak staan.

const VERTEX = 'attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }';

const FRAGMENT = [
  'precision mediump float;',
  'uniform vec2 uRes; uniform float uT; uniform float uU; uniform float uV; uniform float uE;',
  'uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3; uniform vec3 uInk;',

  'vec3 hash32(vec2 p) {',
  '    vec3 q = vec3(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)), dot(p, vec2(419.2, 371.9)));',
  '    return fract(sin(q) * 43758.5453);',
  '}',
  'mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }',
  'float sdBox(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }',

  // een laag confetti: raster van cellen, per cel een eigen vorm, kleur, draaiing en plek
  'void layer(vec2 frag, float size, float seed, float speed, float dens, inout vec4 acc) {',
  '    vec2 p = frag / size;',
  '    p += vec2(-uT * speed * 0.35, uT * speed);',
  '    vec2 id = floor(p);',
  '    vec2 f = fract(p) - 0.5;',
  '    vec3 h = hash32(id + seed);',
  '    vec3 g = hash32(id * 1.7 + seed + 9.0);',
  '    float xn = ((id.x + 0.5) * size / uRes.x - uV) / (1.0 - uV);',
  '    float d = smoothstep(0.26, 0.82, xn) * dens;',
  '    if (h.z > d) return;',
  '    vec2 q = f - (h.xy - 0.5) * 0.45;',
  '    q = rot(g.x * 6.2832 + uT * (g.y - 0.5) * 0.9) * q;',
  '    float r = 0.10 + 0.11 * g.z;',
  '    float sd;',
  '    if (g.y < 0.30) sd = length(q) - r;',
  '    else if (g.y < 0.55) sd = sdBox(q, vec2(r * 1.8, r * 0.5)) - 0.03;',
  '    else if (g.y < 0.78) sd = abs(length(q) - r * 1.1) - r * 0.28;',
  '    else sd = max(length(q) - r * 1.35, q.y);',
  '    float aa = 1.2 / size;',
  '    float a = (1.0 - smoothstep(-aa, aa, sd)) * 0.92;',
  '    vec3 c = h.x < 0.40 ? uC1 : (h.x < 0.75 ? uC3 : uC2);',
  '    acc.rgb = acc.rgb * (1.0 - a) + c * a;',
  '    acc.a = acc.a * (1.0 - a) + a;',
  '}',

  // een serpentine: een dunne golvende lijn
  'void lint(vec2 frag, float x, float fase, float amp, vec3 c, inout vec4 acc) {',
  '    float yc = uRes.y * (0.5 + amp * sin(x * 9.0 + fase + uT * 0.35) + amp * 0.45 * sin(x * 21.0 - fase - uT * 0.25));',
  '    float dist = abs(frag.y - yc);',
  '    float a = (1.0 - smoothstep(0.6 * uU, 1.8 * uU, dist)) * smoothstep(0.42, 0.9, x) * 0.6;',
  '    acc.rgb = acc.rgb * (1.0 - a) + c * a;',
  '    acc.a = acc.a * (1.0 - a) + a;',
  '}',

  'void main() {',
  '    vec2 frag = gl_FragCoord.xy;',
  '    float x = (frag.x / uRes.x - uV) / (1.0 - uV);',
  '    vec4 acc = vec4(0.0);',

  // halftoon: stippenraster waarvan de stippen naar rechts groeien (drukwerktextuur)
  '    float gr = 7.0 * uU;',
  '    vec2 cell = fract((frag + vec2(uT * 2.0, 0.0)) / gr) - 0.5;',
  '    float rad = (0.05 + 0.30 * smoothstep(0.45, 1.0, x)) * step(0.36, x);',
  '    float ha = (1.0 - smoothstep(rad - 0.08, rad + 0.04, length(cell))) * 0.17 * smoothstep(0.36, 0.7, x);',
  '    acc = vec4(uInk * ha, ha);',

  // serpentines
  '    lint(frag, x, 0.0, 0.26, uC1, acc);',

  // confetti in drie lagen: groot en traag, middel, klein en snel
  '    layer(frag, 44.0 * uU, 1.0, 0.10, 0.16, acc);',
  '    layer(frag, 27.0 * uU, 7.0, 0.16, 0.24, acc);',
  '    layer(frag, 15.0 * uU, 13.0, 0.24, 0.30, acc);',

  // korrel: fijne speling in het papier
  '    vec3 n = hash32(floor(frag / (1.3 * uU)));',
  '    float ga = step(0.97, n.x) * 0.08 * smoothstep(0.15, 0.8, x);',
  '    acc.rgb = acc.rgb * (1.0 - ga) + uInk * ga;',
  '    acc.a = acc.a * (1.0 - ga) + ga;',

  // waar de tekst staat: confetti zacht wegdimmen (het patroon zelf blijft op elke pagina gelijk)
  '    acc *= smoothstep(uE, uE + 0.07, frag.x / uRes.x);',
  '    gl_FragColor = acc;', // acc is al voorvermenigvuldigd met alpha
  '}',
].join('\n');

type Kleur = [number, number, number];

/** Een CSS-kleur ("#d80018", "rgb(…)", "oklch(…)") als rood, groen en blauw tussen 0 en 1, zoals de browser hem tekent. */
function alsRgb(waarde: string, terugval: string): Kleur {
  const hulp = document.createElement('span');
  hulp.style.display = 'none';
  hulp.style.color = waarde || terugval;
  document.body.appendChild(hulp);
  const rgb = getComputedStyle(hulp).color.match(/[\d.]+/g);
  hulp.remove();
  return rgb ? [Number(rgb[0]) / 255, Number(rgb[1]) / 255, Number(rgb[2]) / 255] : [0, 0, 0];
}

export interface Confetti {
  /** Tekent opnieuw: bij een andere breedte, een ander lettertype of een ander thema. */
  teken: () => void;
}

/**
 * Zet de confetti klaar op deze canvas in dit kopvlak. Geeft null als de browser geen WebGL heeft of de shader niet compileert: dan
 * blijft de simpele CSS-confetti staan. `tekst` is het blok met de titel, waar de confetti zacht voor wegdimt.
 */
export function maakConfetti(
  canvas: HTMLCanvasElement,
  kop: HTMLElement,
  tekst: HTMLElement | null,
): Confetti | null {
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false });
  if (!gl) return null;

  const compileer = (type: number, bron: string): WebGLShader | null => {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, bron);
    gl.compileShader(shader);
    return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
  };
  const vs = compileer(gl.VERTEX_SHADER, VERTEX);
  const fs = compileer(gl.FRAGMENT_SHADER, FRAGMENT);
  const programma = gl.createProgram();
  if (!vs || !fs || !programma) return null;
  gl.attachShader(programma, vs);
  gl.attachShader(programma, fs);
  gl.linkProgram(programma);
  if (!gl.getProgramParameter(programma, gl.LINK_STATUS)) return null;
  gl.useProgram(programma);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const plek = gl.getAttribLocation(programma, 'p');
  gl.enableVertexAttribArray(plek);
  gl.vertexAttribPointer(plek, 2, gl.FLOAT, false, 0, 0);

  const u = (naam: string) => gl.getUniformLocation(programma, naam);
  const uRes = u('uRes');
  const uT = u('uT');
  const uU = u('uU');
  const uV = u('uV');
  const uE = u('uE');
  const uC1 = u('uC1');
  const uC2 = u('uC2');
  const uC3 = u('uC3');
  const uInk = u('uInk');

  const teken = (): void => {
    const stijl = getComputedStyle(kop);
    gl.uniform3fv(uC1, alsRgb(stijl.getPropertyValue('--thema-confetti-1').trim(), '#D80018'));
    gl.uniform3fv(uC2, alsRgb(stijl.getPropertyValue('--thema-confetti-2').trim(), '#2E9B3A'));
    gl.uniform3fv(uC3, alsRgb(stijl.getPropertyValue('--thema-confetti-3').trim(), '#FFFFFF'));
    gl.uniform3fv(uInk, alsRgb(stijl.getPropertyValue('--thema-op-kop').trim(), '#26211F'));

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(kop.clientWidth * dpr));
    const h = Math.max(1, Math.round(kop.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
    gl.uniform2f(uRes, w, h);
    gl.uniform1f(uU, dpr * Math.min(1, kop.clientHeight / 116));
    // Op elke pagina hetzelfde beeld: het patroon begint op een vaste plek per schermbreedte (smal scherm: verder naar rechts, want de
    // titel neemt daar meer ruimte). Waar de tekst eindigt, dimt de confetti weg.
    let einde = 0;
    if (tekst) {
      const bereik = document.createRange();
      bereik.selectNodeContents(tekst);
      einde = Math.max(
        0,
        (bereik.getBoundingClientRect().right - kop.getBoundingClientRect().left + 12) / kop.clientWidth,
      );
    }
    gl.uniform1f(uE, einde);
    gl.uniform1f(uV, kop.clientWidth < 700 ? 0.36 : 0.12);
    gl.uniform1f(uT, 3.0);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  teken();
  return { teken };
}
