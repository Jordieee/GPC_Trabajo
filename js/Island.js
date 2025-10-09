/**
 * DecorationSystem.js 
 * Arboles y flores
 */

class DecorationSystem {
    
    constructor(scene, onCollider = null, textureLoader) {
        this.scene = scene;
        this.textureLoader = textureLoader || new THREE.TextureLoader();
        this.decorations = [];
        this.onCollider = onCollider;
        this.colliderMaterial = new THREE.MeshBasicMaterial({ visible: false });
    }

    
    decorateIsland(island, options = {}) {
        const {
            treeCount = island.isMain ? 48 : 28,
            flowerGroups = island.isMain ? 16 : 10,
            blockedSectors = island.blockedAngles || []
        } = options;

        const decorations = [];

        const treeRadiusFactor = 0.78; 
        const startDiagonal = Math.PI / 4; 
        const step = (Math.PI * 2) / treeCount;

        let placed = 0, safety = 0;
        while (placed < treeCount && safety < treeCount * 3) {
            const i = placed; 
            let angle = startDiagonal + i * step;

            if (this._angleIsBlocked(angle, blockedSectors)) {
                safety++;
                angle += step / 3;
                if (this._angleIsBlocked(angle, blockedSectors)) {
                    angle += step / 3;
                }
                if (this._angleIsBlocked(angle, blockedSectors)) {
                    placed++;
                    continue;
                }
            }

            const distance = island.radius * treeRadiusFactor;
            const x = island.position.x + Math.cos(angle) * distance;
            const z = island.position.z + Math.sin(angle) * distance;
            const y = island.position.y + island.height / 2;

            const pos = new THREE.Vector3(x, y, z);
            const tree = this._createTree(pos, island);
            decorations.push(tree);
            placed++;
            safety++;
        }

        // --- Flores  ---
        
        const flowerRadiusFactor = 0.35; 
        for (let i = 0; i < flowerGroups; i++) {
            const angle = (i / flowerGroups) * Math.PI * 2;
            const distance = island.radius * flowerRadiusFactor * (0.5 + Math.random() * 0.5);

            const x = island.position.x + Math.cos(angle) * distance;
            const z = island.position.z + Math.sin(angle) * distance;
            const y = island.position.y + island.height / 2;

            const centerPos = new THREE.Vector3(x, y, z);
            const flowers = this._createFlowerGroup(centerPos, island);
            decorations.push(...flowers);
        }

        this.decorations.push(...decorations);
        return decorations;
    }

    _angleIsBlocked(angle, blockedSectors) {
        const TWO_PI = Math.PI * 2;
        const a = (angle % TWO_PI + TWO_PI) % TWO_PI;
        for (const s of blockedSectors) {
            const center = (s.angle % TWO_PI + TWO_PI) % TWO_PI;
            const half = s.width * 0.5;
            let diff = Math.abs(a - center);
            if (diff > Math.PI) diff = TWO_PI - diff;
            if (diff <= half) return true;
        }
        return false;
    }

    
    _getRandomPositionOnIsland(island, radiusFactor = 0.8) {
        const maxAttempts = 10;
        for (let i = 0; i < maxAttempts; i++) {
            const angle = Math.random() * Math.PI * 2;
            const distance = Math.random() * island.radius * radiusFactor;

            const x = island.position.x + Math.cos(angle) * distance;
            const z = island.position.z + Math.sin(angle) * distance;
            const y = island.position.y + island.height / 2;

            const tooClose = this.decorations.some(dec => {
                if (!dec.position) return false;
                const dist = Math.hypot(x - dec.position.x, z - dec.position.z);
                return dist < 2.5;
            });

            if (!tooClose) {
                return new THREE.Vector3(x, y, z);
            }
        }
        return null;
    }

    // Arboles
    _createTree(position, island) {
        const tree = new THREE.Group();
        tree.position.copy(position);

        const trunkHeight = 3.5 + Math.random() * 1.8; 
        const trunkRadius = 0.17 + Math.random() * 0.11;

        const trunkGeometry = new THREE.CylinderGeometry(
            trunkRadius * 0.85,
            trunkRadius,
            trunkHeight,
            10
        );

        const trunkMaterial = new THREE.MeshStandardMaterial({
            color: 0x4a3828,
            roughness: 0.9,
            metalness: 0
        });

        const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
        trunk.position.y = trunkHeight / 2;
        trunk.castShadow = true;
        trunk.receiveShadow = true;
        tree.add(trunk);

        const foliageColors = [0x1a3d0a, 0x2d5016, 0x234a12];
        const foliageColor = foliageColors[Math.floor(Math.random() * foliageColors.length)];

        const sizes = [1.25, 1.05, 0.78];
        const heights = [trunkHeight + 0.25, trunkHeight + 0.9, trunkHeight + 1.55];

        for (let i = 0; i < 3; i++) {
            const foliageGeometry = new THREE.SphereGeometry(sizes[i], 10, 10);
            const foliageMaterial = new THREE.MeshStandardMaterial({
                color: foliageColor,
                roughness: 1.0,
                metalness: 0,
                flatShading: true
            });
            foliageMaterial.color.multiplyScalar(0.7);

            const foliage = new THREE.Mesh(foliageGeometry, foliageMaterial);
            foliage.position.y = heights[i];
            foliage.castShadow = true;
            foliage.receiveShadow = true;
            tree.add(foliage);
        }

        tree.rotation.y = Math.random() * Math.PI * 2;

        this.scene.add(tree);

        const colliderRadius = Math.max(trunkRadius * 1.6, 0.28);
        const colliderHeight = trunkHeight * 0.95;
        const colliderGeo = new THREE.CylinderGeometry(colliderRadius, colliderRadius, colliderHeight, 10);
        const colliderMesh = new THREE.Mesh(colliderGeo, this.colliderMaterial);
        colliderMesh.position.copy(position);
        colliderMesh.position.y = colliderHeight / 2; 
        colliderMesh.name = 'tree_collider';
        this.scene.add(colliderMesh);

        if (typeof this.onCollider === 'function') {
            this.onCollider({
                type: 'tree',
                position: colliderMesh.position, 
                radius: colliderRadius,
                height: colliderHeight,
                mesh: colliderMesh
            });
        }

        return tree;
    }


    _createRock(position, island) {
        const rockSize = 0.2 + Math.random() * 0.3;

        const geometry = new THREE.DodecahedronGeometry(rockSize, 0);

        const posAttr = geometry.attributes.position;
        for (let i = 0; i < posAttr.count; i++) {
            const x = posAttr.getX(i);
            const y = posAttr.getY(i);
            const z = posAttr.getZ(i);

            const deform = 0.15;
            posAttr.setXYZ(
                i,
                x + (Math.random() - 0.5) * deform,
                y + (Math.random() - 0.5) * deform,
                z + (Math.random() - 0.5) * deform
            );
        }
        posAttr.needsUpdate = true;
        geometry.computeVertexNormals();

        const rockColors = [0x606060, 0x707070, 0x555555, 0x808080];
        const rockColor = rockColors[Math.floor(Math.random() * rockColors.length)];

        const material = new THREE.MeshStandardMaterial({
            color: rockColor,
            roughness: 0.95,
            metalness: 0.05,
            flatShading: true
        });

        const rock = new THREE.Mesh(geometry, material);
        rock.position.copy(position);
        rock.position.y += rockSize * 0.4;

        rock.rotation.set(
            Math.random() * Math.PI,
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI
        );

        rock.castShadow = true;
        rock.receiveShadow = true;

        this.scene.add(rock);
        return rock;
    }

    
    _createFlowerGroup(centerPos, island) {
        const flowers = [];
        const flowerCount = 3 + Math.floor(Math.random() * 5);

        const flowerColors = [
            0xcc4a70, 
            0xccb830, 
            0x7a1f8a, 
            0xcc4518, 
            0x1a75c2  
        ];

        const groupColor = flowerColors[Math.floor(Math.random() * flowerColors.length)];

        for (let i = 0; i < flowerCount; i++) {
            const angle = (i / flowerCount) * Math.PI * 2 + Math.random() * 0.5;
            const dist = Math.random() * 0.6;

            const flowerPos = new THREE.Vector3(
                centerPos.x + Math.cos(angle) * dist,
                centerPos.y,
                centerPos.z + Math.sin(angle) * dist
            );

            const flower = this._createFlower(flowerPos, groupColor);
            flowers.push(flower);
        }

        return flowers;
    }

    
    _createFlower(position, color) {
        const flower = new THREE.Group();
        flower.position.copy(position);

        const stemHeight = 0.3 + Math.random() * 0.2;
        const stemGeometry = new THREE.CylinderGeometry(0.02, 0.02, stemHeight, 4);
        const stemMaterial = new THREE.MeshStandardMaterial({
            color: 0x2d5016,
            roughness: 0.8
        });

        const stem = new THREE.Mesh(stemGeometry, stemMaterial);
        stem.position.y = stemHeight / 2;
        flower.add(stem);

        const petalCount = 5;
        const petalRadius = 0.08;
        const petalDistance = 0.12;

        const petalMaterial = new THREE.MeshStandardMaterial({
            color: color,
            roughness: 0.8,
            metalness: 0
        });
        petalMaterial.color.multiplyScalar(0.75);

        for (let i = 0; i < petalCount; i++) {
            const angle = (i / petalCount) * Math.PI * 2;
            const petalGeometry = new THREE.SphereGeometry(petalRadius, 6, 6);
            const petal = new THREE.Mesh(petalGeometry, petalMaterial);

            petal.position.set(
                Math.cos(angle) * petalDistance,
                stemHeight,
                Math.sin(angle) * petalDistance
            );

            flower.add(petal);
        }

        const centerGeometry = new THREE.SphereGeometry(0.06, 6, 6);
        const centerMaterial = new THREE.MeshStandardMaterial({
            color: 0xccaa00,
            roughness: 0.8
        });
        const center = new THREE.Mesh(centerGeometry, centerMaterial);
        center.position.y = stemHeight;
        flower.add(center);

        flower.rotation.y = Math.random() * Math.PI * 2;

        this.scene.add(flower);
        return flower;
    }

    
    clear() {
        this.decorations.forEach(dec => {
            if (dec.parent) dec.parent.remove(dec);
            if (dec.geometry) dec.geometry.dispose();
            if (dec.material) {
                if (Array.isArray(dec.material)) {
                    dec.material.forEach(m => m.dispose());
                } else {
                    dec.material.dispose();
                }
            }
        });
        this.decorations = [];
    }
}


/**
 * Island.js 
 */

const ANISO = 8; 

function setupColorTex(tex, ru, rv) {
  if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
  else tex.encoding = THREE.sRGBEncoding;

  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(ru, rv);
  tex.anisotropy = ANISO;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
}

function setupDataTex(tex, ru, rv) {
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(ru, rv);
  tex.anisotropy = ANISO;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
}

// --- CÉSPED ---
const __grassTexLoader = new THREE.TextureLoader();
function createGrassMaterial(tiling = 4) {
  const colorMap = __grassTexLoader.load('textures/Grass005_1K-PNG_Color.png');
  const normalMap = __grassTexLoader.load('textures/Grass005_1K-PNG_NormalGL.png');
  const roughMap  = __grassTexLoader.load('textures/Grass005_1K-PNG_Roughness.png');

  setupColorTex(colorMap, tiling, tiling);
  setupDataTex(normalMap, tiling, tiling);
  setupDataTex(roughMap,  tiling, tiling);

  const mat = new THREE.MeshStandardMaterial({
    map: colorMap,
    normalMap,
    roughnessMap: roughMap,
    metalness: 0.0,
    roughness: 0.98,
    color: new THREE.Color(0x3a7a2d)
  });

  mat.color.multiplyScalar(0.6);
  mat.normalScale = new THREE.Vector2(1.0, 1.0);
  mat.flatShading = true;

  return mat;
}

// --- LADRILLO PUENTE ---
const __brickTexLoader = new THREE.TextureLoader();
function createBrickMaterial(repeatU = 4, repeatV = 2) {
  const colorMap = __brickTexLoader.load('textures/Bricks097_1K-PNG_Color.png');
  const normalMap = __brickTexLoader.load('textures/Bricks097_1K-PNG_NormalGL.png');
  const roughMap  = __brickTexLoader.load('textures/Bricks097_1K-PNG_Roughness.png');

  setupColorTex(colorMap, repeatU, repeatV);
  setupDataTex(normalMap, repeatU, repeatV);
  setupDataTex(roughMap,  repeatU, repeatV);

  const mat = new THREE.MeshStandardMaterial({
    map: colorMap,
    normalMap,
    roughnessMap: roughMap,
    metalness: 0.0,
    roughness: 0.97,
  });

  mat.color.multiplyScalar(0.8);
  mat.normalScale = new THREE.Vector2(1.0, 1.0);

  return mat;
}


class IslandManager {
    constructor(scene) {
        this.scene = scene;
        this.islands = [];
        this.bridges = [];
        this.walkableMeshes = []; 
        this.obstacles = [];      

        this.createIslands();

        this.decorationSystem = new DecorationSystem(
            scene,
            (collider) => { this.obstacles.push(collider); }
        );

        this._computeBlockedSectorsForAllIslands();
        this.decorateAllIslands();
    }

    createIslands() {
        const mainRadius = 30;
        const secondaryRadius = 18;
        const mainIsland = this.createIsland(0, 0, mainRadius, 0x2d5016, true);
        this.islands.push(mainIsland);

        const numSecondaryIslands = 4;
        const distance = 70;
        const secondaryIslands = [];

        for (let i = 0; i < numSecondaryIslands; i++) {
            const angle = (i / numSecondaryIslands) * Math.PI * 2;
            const x = Math.cos(angle) * distance;
            const z = Math.sin(angle) * distance;

            const island = this.createIsland(x, z, secondaryRadius, 0x3d6a1f, false);
            this.islands.push(island);
            secondaryIslands.push(island);
        }

        for (let i = 0; i < secondaryIslands.length; i++) {
            const bridge = this.createBridge(mainIsland, secondaryIslands[i]);
            this.bridges.push(bridge);
        }
    }

    createIsland(x, z, radius, color, isMain) {
        const height = isMain ? 3.2 : 2.8;

        const geometry = new THREE.CylinderGeometry(radius, radius * 0.96, height, 48);
        const tiling = Math.max(3, Math.round(radius / 6));
        const material = createGrassMaterial(tiling);

        const islandMesh = new THREE.Mesh(geometry, material);
        islandMesh.position.set(x, height / 2, z);
        islandMesh.castShadow = true;
        islandMesh.receiveShadow = true;
        this.scene.add(islandMesh);

        this.walkableMeshes.push(islandMesh);

        return {
            mesh: islandMesh,
            position: islandMesh.position, 
            radius,
            height,
            isMain,
            blockedAngles: [] 
        };
    }

    createBridge(island1, island2) {
        const bridgeWidth  = 12;
        const bridgeHeight = 1.0;

        const p1 = island1.position.clone();
        const p2 = island2.position.clone();

        const dir = new THREE.Vector3().subVectors(p2, p1);
        const distance = dir.length();
        dir.normalize();

        const startPoint = p1.clone().add(dir.clone().multiplyScalar(island1.radius - 3));
        const endPoint   = p2.clone().sub(dir.clone().multiplyScalar(island2.radius - 3));
        const bridgeLength = startPoint.distanceTo(endPoint);

        const geometry = new THREE.BoxGeometry(bridgeWidth, bridgeHeight, bridgeLength);
        geometry.attributes.uv2 = geometry.attributes.uv;

        const tilingU = Math.max(3, Math.round(bridgeLength / 6)); 
        const tilingV = Math.max(1, Math.round(bridgeWidth  / 3)); 
        const material = createBrickMaterial(tilingU, tilingV);

        const bridge = new THREE.Mesh(geometry, material);
        bridge.castShadow = true;
        bridge.receiveShadow = true;

        const topY1 = island1.position.y + island1.height / 2;
        const topY2 = island2.position.y + island2.height / 2;
        const BRIDGE_DROP = 0.4;
        const deckY = Math.max(topY1, topY2) + bridgeHeight / 2 - BRIDGE_DROP;

        const mid = new THREE.Vector3().addVectors(startPoint, endPoint).multiplyScalar(0.5);
        mid.y = deckY;
        bridge.position.copy(mid);

        const angle = Math.atan2(dir.x, dir.z);
        bridge.rotation.y = angle;

        this.scene.add(bridge);
        this.walkableMeshes.push(bridge);

        this.addRealisticRailings(bridge, bridgeWidth, bridgeLength, bridgeHeight);

        return {
            mesh: bridge,
            position: bridge.position.clone(),
            rotation: bridge.rotation.clone(),
            width: bridgeWidth,
            length: bridgeLength,
            height: bridgeHeight,
            a: island1,
            b: island2
        };
    }

    addRealisticRailings(bridge, width, length, height) {
        const postEvery = Math.max(1, Math.round(length / 6));
        const railThick = 0.18;
        const railHeight = 1.0;
        const midRailY = 0.55;
        const topRailY = 0.95;
        const inset = 0.2;

        const woodMat = new THREE.MeshPhongMaterial({ color: 0x5e3b22 });
        woodMat.color.convertSRGBToLinear();

        const ropeMat = new THREE.MeshPhongMaterial({ color: 0x9a845a });
        ropeMat.color.convertSRGBToLinear();

        const railLen = length - 0.6;
        const railGeo = new THREE.BoxGeometry(railThick, railThick, railLen);

        const leftTop = new THREE.Mesh(railGeo, woodMat);
        leftTop.position.set( (width/2) - (railThick/2) - inset, (height/2) + topRailY, 0);
        leftTop.castShadow = true; leftTop.receiveShadow = true;
        bridge.add(leftTop);

        const leftMid = new THREE.Mesh(railGeo, woodMat);
        leftMid.position.set( (width/2) - (railThick/2) - inset, (height/2) + midRailY, 0);
        leftMid.castShadow = true; leftMid.receiveShadow = true;
        bridge.add(leftMid);

        const rightTop = new THREE.Mesh(railGeo, woodMat);
        rightTop.position.set( -(width/2) + (railThick/2) + inset, (height/2) + topRailY, 0);
        rightTop.castShadow = true; rightTop.receiveShadow = true;
        bridge.add(rightTop);

        const rightMid = new THREE.Mesh(railGeo, woodMat);
        rightMid.position.set( -(width/2) + (railThick/2) + inset, (height/2) + midRailY, 0);
        rightMid.castShadow = true; rightMid.receiveShadow = true;
        bridge.add(rightMid);

        const postGeo = new THREE.BoxGeometry(railThick, railHeight, railThick);
        const postsPerSide = Math.max(6, Math.round(length / postEvery));
        for (let i = 0; i <= postsPerSide; i++) {
            const z = - (length/2 - 0.3) + (i * (length - 0.6) / postsPerSide);

            const pL = new THREE.Mesh(postGeo, woodMat);
            pL.position.set( (width/2) - (railThick/2) - inset, (height/2) + railHeight/2, z);
            pL.castShadow = true; pL.receiveShadow = true;
            bridge.add(pL);

            const pR = new THREE.Mesh(postGeo, woodMat);
            pR.position.set( -(width/2) + (railThick/2) + inset, (height/2) + railHeight/2, z);
            pR.castShadow = true; pR.receiveShadow = true;
            bridge.add(pR);
        }

        const ropeRadius = 0.06;
        const makeRope = (xSide) => {
            const z0 = -(railLen/2), z1 = railLen/2;
            const y = (height/2) + midRailY;
            const sag = 0.15;

            const p0 = new THREE.Vector3(xSide, y, z0);
            const p1 = new THREE.Vector3(xSide, y - sag, 0);
            const p2 = new THREE.Vector3(xSide, y, z1);

            const curve = new THREE.QuadraticBezierCurve3(p0, p1, p2);
            const tubeGeo = new THREE.TubeGeometry(curve, 24, ropeRadius, 8, false);
            const rope = new THREE.Mesh(tubeGeo, ropeMat);
            rope.castShadow = true; rope.receiveShadow = true;
            bridge.add(rope);
        };

        makeRope( (width/2) - (railThick/2) - inset );
        makeRope( -(width/2) + (railThick/2) + inset );
    }

    // === API ===
    getIslands() { return this.islands; }
    getBridges() { return this.bridges; }
    getSecondaryIslands() { return this.islands.filter(i => !i.isMain); }
    getObstacles() { return this.obstacles; }

    getRandomSpawnPosition() {
        const islands = this.getIslands();
        const rand = islands[Math.floor(Math.random() * islands.length)];
        const angle = Math.random() * Math.PI * 2;
        const dist = 2 + Math.random() * (rand.radius - 4);
        return new THREE.Vector3(
            rand.position.x + Math.cos(angle) * dist,
            rand.position.y + rand.height / 2 + 0.6,
            rand.position.z + Math.sin(angle) * dist
        );
    }

    isPositionValid(position, checkRadius = 0.6) {
        for (let island of this.islands) {
            const dist2D = Math.hypot(position.x - island.position.x, position.z - island.position.z);
            if (dist2D <= island.radius - checkRadius) return true;
        }
        for (let bridge of this.bridges) {
            if (this.isPositionOnBridge(position, bridge, checkRadius)) return true;
        }
        return false;
    }

    isPositionOnBridge(position, bridge, checkRadius) {
        const localPos = new THREE.Vector3(position.x, position.y, position.z).sub(bridge.position);
        const angle = -bridge.rotation.y;
        const rx = localPos.x * Math.cos(angle) - localPos.z * Math.sin(angle);
        const rz = localPos.x * Math.sin(angle) + localPos.z * Math.cos(angle);
        const halfW = bridge.width / 2 - checkRadius;
        const halfL = bridge.length / 2 - checkRadius;
        return Math.abs(rx) <= halfW && Math.abs(rz) <= halfL;
    }

    getSurfaceHeightAt(worldPosition, maxHeight = 200) {
        if (!this._raycaster) this._raycaster = new THREE.Raycaster();
        const origin = new THREE.Vector3(worldPosition.x, maxHeight, worldPosition.z);
        const dir = new THREE.Vector3(0, -1, 0);
        this._raycaster.set(origin, dir);

        const hits = this._raycaster.intersectObjects(this.walkableMeshes, true);
        if (hits && hits.length) {
            return { ok: true, y: hits[0].point.y };
        }
        return { ok: false, y: 0 };
    }

    
    resolveCharacterCollisions(position, radius = 0.4) {
        let collided = false;
        for (const ob of this.obstacles) {
            const dx = position.x - ob.position.x;
            const dz = position.z - ob.position.z;
            const dist = Math.hypot(dx, dz);
            const minDist = radius + ob.radius;

            if (dist < minDist && dist > 1e-6) {
                const push = (minDist - dist) + 1e-3; 
                position.x += (dx / dist) * push;
                position.z += (dz / dist) * push;
                collided = true;
            }
        }
        return collided;
    }

    decorateAllIslands() {
        this.islands.forEach(island => {
            this.decorationSystem.decorateIsland(island, {
                treeCount: island.isMain ? 48 : 28,          
                flowerGroups: island.isMain ? 16 : 10,
                blockedSectors: island.blockedAngles || []
            });
        });
    }

    
    _computeBlockedSectorsForAllIslands() {
        this.islands.forEach(i => i.blockedAngles = []);

        const addBlocked = (islandFrom, islandTo) => {
            const dir = new THREE.Vector3().subVectors(islandTo.position, islandFrom.position);
            const angle = Math.atan2(dir.x, dir.z);
            const width = 0.61;
            islandFrom.blockedAngles.push({ angle, width });
        };

        for (const br of this.bridges) {
            addBlocked(br.a, br.b);
            addBlocked(br.b, br.a);
        }

    }
}
