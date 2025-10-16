/**
 * game.js
 * Script principal del juego 
 */

var renderer, scene, camera;
var miniCamera, miniFrustumSize = 160; // minimapa
var player, waveManager, islandManager;
var stats;
var clock;
var gameOver = false;
var cameraDistance = 25; 
var cameraHeight = 20;
var cameraAngleH = 0; 
var cameraAngleV = 0.5; 
var mouseSensitivity = 0.002;

function loadCrossCubeTexture(url, onLoad) {
  const img = new Image();
  img.onload = () => {
    const w = img.width, h = img.height;
    const face = Math.min(Math.floor(w / 4), Math.floor(h / 3));
    if (face <= 0) {
      console.error('Skybox: la imagen no es 4x3 (cross).', w, h);
      return;
    }
    const map = {
      px: { x: 2, y: 1 }, // +X
      nx: { x: 0, y: 1 }, // -X
      py: { x: 1, y: 0 }, // +Y
      ny: { x: 1, y: 2 }, // -Y
      pz: { x: 1, y: 1 }, // +Z
      nz: { x: 3, y: 1 }, // -Z
    };

    function slice(ix, iy) {
      const c = document.createElement('canvas');
      c.width = c.height = face;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, ix * face, iy * face, face, face, 0, 0, face, face);
      return c; 
    }

    const images = [
      slice(map.px.x, map.px.y),
      slice(map.nx.x, map.nx.y),
      slice(map.py.x, map.py.y),
      slice(map.ny.x, map.ny.y),
      slice(map.pz.x, map.pz.y),
      slice(map.nz.x, map.nz.y),
    ];

    const cube = new THREE.CubeTexture();
    cube.images = images;                        
    cube.mapping = THREE.CubeReflectionMapping;
    cube.wrapS = cube.wrapT = THREE.ClampToEdgeWrapping;
    cube.minFilter = THREE.LinearMipmapLinearFilter;
    cube.magFilter = THREE.LinearFilter;
    cube.generateMipmaps = true;
    cube.type = THREE.UnsignedByteType;
    cube.format = THREE.RGBAFormat;
    cube.encoding = THREE.sRGBEncoding;         
    cube.needsUpdate = true;

    onLoad && onLoad(cube);
  };
  img.onerror = (e) => console.error('No se pudo cargar skybox', url, e);
  img.src = url;
}

function setEnvIntensity(root, value) {
  root.traverse?.((obj) => {
    const m = obj.material;
    if (!m) return;
    const mats = Array.isArray(m) ? m : [m];
    for (const mat of mats) {
      if ('envMapIntensity' in mat) {
        mat.envMapIntensity = value;
        mat.needsUpdate = true;
      }
    }
  });
}

window.__startGameNow = function(){
  if(!window.__gameBooted){
    window.__gameBooted = true;
    init();
    render();
  }
}

window.__startNextWave = function(){
  if (window.waveManager && typeof window.waveManager.startWave === 'function') {
    window.waveManager.startWave();
  }
}

/* ------------------------ Cámara tercera persona ------------------------ */
function updateCamera(deltaTime) {
  if (!player || player.isDead()) return;

  const playerPos = player.getPosition();

  // Calcular posición de la cámara basada en los ángulos
  const horizontalDist = cameraDistance * Math.cos(cameraAngleV);
  const verticalHeight = cameraDistance * Math.sin(cameraAngleV);
  
  const targetCameraPos = new THREE.Vector3(
    playerPos.x + Math.sin(cameraAngleH) * horizontalDist,
    playerPos.y + verticalHeight + cameraHeight * 0.3,
    playerPos.z + Math.cos(cameraAngleH) * horizontalDist
  );

  camera.position.lerp(targetCameraPos, deltaTime * 3);
  camera.lookAt(new THREE.Vector3(
    playerPos.x,
    playerPos.y + 2, 
    playerPos.z
  ));
}

/* ------------------------------ Inicialización ------------------------------ */
function init() {

  // Stats 
  stats = new Stats();
  stats.showPanel(0); 
  stats.dom.style.position = 'absolute';
  stats.dom.style.top = '20px';
  stats.dom.style.right = '20px';
  stats.dom.style.left = 'auto';
  document.body.appendChild(stats.dom);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(new THREE.Color(0x87CEEB));

  renderer.outputEncoding = THREE.SRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.55; 

  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  document.getElementById('container').appendChild(renderer.domElement);

  // Escena
  scene = new THREE.Scene();

  // SKYBOX 
  loadCrossCubeTexture('textures/skybox/skybox.png', (cube) => {
    scene.background = cube;

    const pmrem = new THREE.PMREMGenerator(renderer);
    
    const env = pmrem.fromCubemap(cube).texture;
    scene.environment = env;
    pmrem.dispose();

    setEnvIntensity(scene, 0.7);
  });

  // Cámara principal
  var aspectRatio = window.innerWidth / window.innerHeight;
  camera = new THREE.PerspectiveCamera(50, aspectRatio, 0.1, 200);
  camera.position.set(0, 30, 30);
  camera.lookAt(0, 0, 0);

  // Minimap 
  miniCamera = new THREE.OrthographicCamera(
    -miniFrustumSize / 2, miniFrustumSize / 2,
     miniFrustumSize / 2, -miniFrustumSize / 2,
     0.1, 500
  );
  miniCamera.up.set(0, 0, -1); 
  miniCamera.position.set(0, 220, 0);
  miniCamera.lookAt(0, 0, 0);

  clock = new THREE.Clock();

  setupLights();

  islandManager = new IslandManager(scene);
  player = new Player(scene, islandManager);
  waveManager = new WaveManager(scene, islandManager);
  window.waveManager = waveManager;
  waveManager.startWave();

  camera.layers.enable(0);
  miniCamera.layers.enable(0);
  miniCamera.layers.enable(2);

  (function(){
    const markerSize = 2.6;
    const markerGeo = new THREE.PlaneGeometry(markerSize, markerSize);
    const markerMat = new THREE.MeshBasicMaterial({ color: 0x007bff, depthTest: false, transparent: true });
    const marker = new THREE.Mesh(markerGeo, markerMat);
    marker.rotation.x = -Math.PI / 2;
    marker.layers.set(2);
    marker.renderOrder = 999;
    scene.add(marker);
    player._minimapMarker = marker;

    const originalPlayerUpdate = player.update.bind(player);
    player.update = (dt, enemies) => {
      originalPlayerUpdate(dt, enemies);
      const p = player.getPosition();
      marker.position.set(p.x, 0.1, p.z);
    };
  })();

  document.addEventListener('mousemove', (e) => {
    const deltaX = e.movementX || 0;
    const deltaY = e.movementY || 0;
    
    cameraAngleH -= deltaX * mouseSensitivity;
    cameraAngleV += deltaY * mouseSensitivity;
    
    cameraAngleV = Math.max(0.1, Math.min(Math.PI / 2 - 0.1, cameraAngleV));
  });

  window.addEventListener('resize', updateAspectRatio);

  console.log("Juego inicializado correctamente");
}

/* --------------------------------- Luces --------------------------------- */
function setupLights() {
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.35);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.85);
  directionalLight.position.set(30, 40, 20);
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.width = 2048;
  directionalLight.shadow.mapSize.height = 2048;
  directionalLight.shadow.camera.near = 0.5;
  directionalLight.shadow.camera.far = 200;
  directionalLight.shadow.camera.left = -80;
  directionalLight.shadow.camera.right = 80;
  directionalLight.shadow.camera.top = 80;
  directionalLight.shadow.camera.bottom = -80;
  scene.add(directionalLight);

  const hemiLight = new THREE.HemisphereLight(0xB1E1FF, 0x7A6A53, 0.35);
  scene.add(hemiLight);

  const fillLight = new THREE.DirectionalLight(0xFFE8CC, 0.35);
  fillLight.position.set(-20, 15, -20);
  scene.add(fillLight);
}


function updateAspectRatio() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}

function updateMiniCamera() {
  if (!player) return;
  const playerPos = player.getPosition();
  miniCamera.position.set(playerPos.x, 220, playerPos.z);
  miniCamera.lookAt(playerPos.x, playerPos.y, playerPos.z);
  miniCamera.updateProjectionMatrix();
}

/* ---------------------------------- HUD ---------------------------------- */
function updateHUD() {
  const waveTxt   = (waveManager && typeof waveManager.getCurrentWave === 'function') ? waveManager.getCurrentWave() : 1;
  const aliveTxt  = (waveManager && typeof waveManager.getAliveEnemyCount === 'function') ? waveManager.getAliveEnemyCount() : 0;
  const killsTxt  = (waveManager && typeof waveManager.getTotalKills === 'function') ? waveManager.getTotalKills() : 0;
  const healthTxt = (player && typeof player.health === 'number') ? Math.max(0, player.health) : 0;

  document.getElementById('wave').textContent    = waveTxt;
  document.getElementById('enemies').textContent = aliveTxt;
  document.getElementById('kills').textContent   = killsTxt;
  document.getElementById('health').textContent  = healthTxt;

  // Health bar 
  const fill = document.getElementById('healthFill');
  if (fill) {
    const pct = Math.max(0, Math.min(100, healthTxt));
    fill.style.width = pct + '%';
    if (pct > 60) fill.style.background = 'linear-gradient(90deg,#19e68c,#0fbf6f)';
    else if (pct > 30) fill.style.background = 'linear-gradient(90deg,#ffd166,#f4a261)';
    else fill.style.background = 'linear-gradient(90deg,#ff6b6b,#f94144)';
  }
}

/* ----------------------------- Game Over check ---------------------------- */
function checkGameOver() {
  if (player.isDead() && !gameOver) {
    gameOver = true;
    document.getElementById('gameOver').style.display = 'block';
  }
}

/* --------------------------------- Update -------------------------------- */
function update() {
  const deltaTime = clock.getDelta();
  if (gameOver) return;

  

  player.update(deltaTime, waveManager.enemies);
  waveManager.update(deltaTime, player);

  if (player.isAttacking) {
    waveManager.checkPlayerAttacks(player);
  }

  updateCamera(deltaTime);
  updateHUD();
  checkGameOver();
}

/* --------------------------------- Render -------------------------------- */
function render() {
  requestAnimationFrame(render);
  if (stats) stats.begin();

  update();

  renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
  renderer.setScissorTest(false);
  renderer.render(scene, camera);

  const margin = 16; // px
  const size = Math.floor(Math.min(window.innerWidth, window.innerHeight) * 0.18);
  const width = size, height = size;
  const x = window.innerWidth - width - margin;
  const y = margin;

  updateMiniCamera();

  const prevBG = scene.background;
  const prevFog = scene.fog;
  const prevClearColor = renderer.getClearColor(new THREE.Color());
  const prevClearAlpha = renderer.getClearAlpha();

  scene.background = null;
  scene.fog = null;

  renderer.clearDepth();
  renderer.setScissorTest(true);
  renderer.setScissor(x, y, width, height);
  renderer.setViewport(x, y, width, height);
  renderer.setClearColor(0x000000, 0); 
  renderer.clear(true, true, true);
  renderer.render(scene, miniCamera);

  renderer.setScissorTest(false);
  scene.background = prevBG;
  scene.fog = prevFog;
  renderer.setClearColor(prevClearColor, prevClearAlpha);
  if (stats) stats.end();

}

/* ------------------------------ Zoom  ---------------------------- */
function handleWheel(event) {
  event.preventDefault();
  const zoomSpeed = 0.02;
  const delta = event.deltaY * zoomSpeed;
  cameraDistance = Math.max(10, Math.min(50, cameraDistance + delta));
}
window.addEventListener('wheel', handleWheel, { passive: false });
