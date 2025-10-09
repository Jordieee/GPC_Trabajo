/**
 * Enemy.js
 * Sistema de 3 tipos de enemigos:
 * - Basic: equilibrado 
 * - Fast: rápido pero débil 
 * - Tank: lento pero resistente 
 */

class Enemy {
    constructor(scene, position, islandManager, type = 'basic') {
        this.scene = scene;
        this.islandManager = islandManager;
        this.type = type;

        // Stats base 
        this._initStatsForType(type);
        this.attackCooldown = 0;
        this.isDead = false;
        this.frozen = false;

        // Render/Anim
        this.loader = new THREE.FBXLoader();
        this.modelRoot = new THREE.Group();
        this.modelRoot.position.copy(position);
        this.scene.add(this.modelRoot);
        this.mixer = null;
        this.actions = {};
        this.activeAction = null;
        this.materialsWithEmissive = [];

        this._createPlaceholder();
        this._loadFBXModelAndWalk();

        // Pathfinding 
        this.currentDirection = null;
        this.pathUpdateTimer = 0;
        this.pathUpdateInterval = 0.3;
        this.stuckCounter = 0;
        this.lastPosition = position.clone();
        
        this.collisionRadius = 0.5;
    }

    _initStatsForType(type) {
        switch(type) {
            case 'tank':
                // Tanque lento pero resistente
                this.health = 120;
                this.speed = 2.5;
                this.attackRange = 2.2;
                this.attackDamage = 15;
                this.MODEL_SCALE = 0.011; 
                this.color = 0x8b0000; 
                break;
            case 'fast':
                // Rápido veloz pero débil
                this.health = 30;
                this.speed = 7;
                this.attackRange = 1.8;
                this.attackDamage = 8;
                this.MODEL_SCALE = 0.008; 
                this.color = 0x00ff00; 
                break;
            case 'basic':
            default:
                // Básico equilibrado
                this.health = 50;
                this.speed = 4;
                this.attackRange = 2;
                this.attackDamage = 10;
                this.MODEL_SCALE = 0.009;
                this.color = 0xff0000; 
                break;
        }
    }

    _makeClipInPlace(clip, { rootNames = ['mixamorigHips','mixamorig:Hips','Hips','Root','Pelvis'], lockX = true, lockY = true, lockZ = true } = {}) {
        for (const track of clip.tracks) {
            if (!/\.position$/.test(track.name)) continue;
            const targetName = track.name.split('.')[0];
            const isRoot = rootNames.some(r => r.toLowerCase() === targetName.toLowerCase());
            if (!isRoot) continue;
            const values = track.values;
            for (let i = 0; i < values.length; i += 3) {
                if (lockX) values[i + 0] = 0;
                if (lockY) values[i + 1] = 0;
                if (lockZ) values[i + 2] = 0;
            }
        }
        return clip;
    }

    _createPlaceholder() {
        const geometry = new THREE.SphereGeometry(0.7, 16, 16);
        const material = new THREE.MeshPhongMaterial({ color: this.color, emissive: 0x330000 });
        const placeholder = new THREE.Mesh(geometry, material);
        placeholder.castShadow = true;
        placeholder.receiveShadow = true;
        placeholder.name = 'enemy_placeholder';
        this.modelRoot.add(placeholder);
        this.mesh = this.modelRoot;
    }

    _removePlaceholder() {
        const ph = this.modelRoot.getObjectByName('enemy_placeholder');
        if (ph) {
            if (ph.material) {
                const idx = this.materialsWithEmissive.indexOf(ph.material);
                if (idx !== -1) {
                    this.materialsWithEmissive.splice(idx, 1);
                }
                ph.material.dispose?.();
            }
            
            this.modelRoot.remove(ph);
            ph.geometry && ph.geometry.dispose?.();
        }
    }

    _loadFBXModelAndWalk() {
        this.loader.load(
            '/models/Enemy/Enemy.fbx',
            (fbx) => {
                fbx.scale.setScalar(this.MODEL_SCALE);
                fbx.traverse((o) => { 
                    if (o.isMesh) { 
                      o.castShadow = true; 
                      o.receiveShadow = true;
                  
                      if (o.material) {
                        const materials = Array.isArray(o.material) ? o.material : [o.material];
                        materials.forEach(mat => {
                          if (mat.map && mat.map.image) { 
                            mat.map.encoding = THREE.sRGBEncoding;
                          }
                          if (mat.emissiveMap && mat.emissiveMap.image) { 
                            mat.emissiveMap.encoding = THREE.sRGBEncoding;
                          }
                          if (mat.aoMap && mat.aoMap.image) { 
                            mat.aoMap.encoding = THREE.LinearEncoding;
                          }
                  
                          if (mat.color && mat.color.getHex() === 0x000000) {
                            mat.color.setHex(this.color);
                          }
                          if (mat.emissive) {
                            mat.emissive.setHex(0x0a0505);
                          }
                          mat.needsUpdate = true;
                        });
                      }
                    } 
                  });
                  
                this.modelRoot.add(fbx);
                this._removePlaceholder();
    
                this.mixer = new THREE.AnimationMixer(fbx);
                
                fbx.traverse((o) => {
                    if (o.isMesh) {
                        const materials = Array.isArray(o.material) ? o.material : [o.material];
                        for (const m of materials) {
                            if (m && 'emissive' in m && m.emissive) {
                                if (!m.userData) m.userData = {};
                                m.userData._origEmissive = m.emissive.getHex();
                                this.materialsWithEmissive.push(m);
                            }
                        }
                    }
                });
                
                this.loader.setResourcePath('/models/Enemy/');
    
                this.loader.load('/models/Enemy/Walk.fbx', (animFBX) => {
                    const clip = animFBX.animations && animFBX.animations[0];
                    if (clip) {
                        const inPlace = this._makeClipInPlace(clip);
                        const action = this.mixer.clipAction(inPlace);
                        action.setLoop(THREE.LoopRepeat, Infinity);
                        action.timeScale = this.type === 'fast' ? 3.5 : (this.type === 'tank' ? 2.0 : 2.5);
                        action.enabled = true;
                        action.play();
                        this.actions.walk = action;
                        this.activeAction = action;
                    }
                });
            },
            undefined,
            (err) => { console.error('Error cargando Enemy.fbx', err); }
        );
    }

    update(deltaTime, player, otherEnemies) {
        if (this.isDead) return;

        if (this.mixer) this.mixer.update(deltaTime);

        if (this.frozen) {
            this._setWalkingState(false);
            return;
        }

        this.attackCooldown -= deltaTime;
        this.pathUpdateTimer += deltaTime;

        const playerPos = player.getPosition();
        const enemyPos = this.mesh.position;
        const distance = enemyPos.distanceTo(playerPos);

        if (distance < this.attackRange) {
            if (this.attackCooldown <= 0) {
                this.attackPlayer(player);
                // Tanques atacan maas lento y rapidos más seguido
                this.attackCooldown = this.type === 'tank' ? 1.5 : (this.type === 'fast' ? 0.7 : 1.0);
            }
            this.lookAt(playerPos);
            return;
        }

        if (this.pathUpdateTimer >= this.pathUpdateInterval) {
            this.pathUpdateTimer = 0;
            this.updatePath(playerPos);

            const movedDistance = this.mesh.position.distanceTo(this.lastPosition);
            if (movedDistance < 0.1) this.stuckCounter++; else this.stuckCounter = 0;
            this.lastPosition.copy(this.mesh.position);
        }

        this.moveTowardsPlayer(playerPos, deltaTime, otherEnemies);
    }

    updatePath(targetPos) {
        const direction = new THREE.Vector3()
            .subVectors(targetPos, this.mesh.position).normalize();
        this.currentDirection = direction;
    }

    moveTowardsPlayer(playerPos, deltaTime, otherEnemies) {
        if (!this.currentDirection) this.updatePath(playerPos);
        const moveDir = this.currentDirection.clone();

        const separationForce = new THREE.Vector3();
        const separationRadius = 2;
        for (let other of otherEnemies) {
            if (other === this || other.isDead) continue;
            const diff = new THREE.Vector3().subVectors(this.mesh.position, other.mesh.position);
            const dist = diff.length();
            if (dist < separationRadius && dist > 0) {
                diff.normalize().multiplyScalar((separationRadius - dist) / separationRadius);
                separationForce.add(diff);
            }
        }
        moveDir.add(separationForce.multiplyScalar(0.5));

        if (this.stuckCounter > 3) {
            const randomAngle = (Math.random() - 0.5) * Math.PI / 2;
            const rx = moveDir.x * Math.cos(randomAngle) - moveDir.z * Math.sin(randomAngle);
            const rz = moveDir.x * Math.sin(randomAngle) + moveDir.z * Math.cos(randomAngle);
            moveDir.set(rx, 0, rz);
            this.stuckCounter = 0;
        }

        moveDir.normalize();

        const moveAmount = this.speed * deltaTime;
        const safetyRadius = 0.3;
        const newPos = this.mesh.position.clone().addScaledVector(moveDir, moveAmount);

        let moved = false;
        if (this.islandManager.isPositionValid(newPos, safetyRadius)) {
            this.mesh.position.copy(newPos);
            this.islandManager.resolveCharacterCollisions(this.mesh.position, this.collisionRadius);
            this.lookAt(this.mesh.position.clone().add(moveDir));
            moved = true;
        } else {
            const reduced = this.mesh.position.clone().addScaledVector(moveDir, moveAmount * 0.6);
            if (this.islandManager.isPositionValid(reduced, safetyRadius)) {
                this.mesh.position.copy(reduced);
                this.islandManager.resolveCharacterCollisions(this.mesh.position, this.collisionRadius);
                moved = true;
            } else {
                const small = this.mesh.position.clone().addScaledVector(moveDir, moveAmount * 0.4);
                if (this.islandManager.isPositionValid(small, safetyRadius)) {
                    this.mesh.position.copy(small);
                    this.islandManager.resolveCharacterCollisions(this.mesh.position, this.collisionRadius);
                    moved = true;
                } else {
                    const xOnly = this.mesh.position.clone(); xOnly.x += moveDir.x * moveAmount;
                    if (this.islandManager.isPositionValid(xOnly, safetyRadius)) {
                        this.mesh.position.copy(xOnly);
                        this.islandManager.resolveCharacterCollisions(this.mesh.position, this.collisionRadius);
                        moved = true;
                    } else {
                        const zOnly = this.mesh.position.clone(); zOnly.z += moveDir.z * moveAmount;
                        if (this.islandManager.isPositionValid(zOnly, safetyRadius)) {
                            this.mesh.position.copy(zOnly);
                            this.islandManager.resolveCharacterCollisions(this.mesh.position, this.collisionRadius);
                            moved = true;
                        }
                    }
                }
            }
        }

        if (!moved) this.stuckCounter++;

        this._setWalkingState(moved);

        const heightResult = this.getHeightAt(this.mesh.position);
        if (heightResult.isValid) this.mesh.position.y = heightResult.height;
    }

    _setWalkingState(isMoving) {
        if (!this.mixer || !this.actions.walk) return;
        const shouldPlay = isMoving && !this.isDead;
        if (shouldPlay) {
            if (this.activeAction !== this.actions.walk) {
                this.actions.walk.reset();
                this.actions.walk.enabled = true;
                this.actions.walk.play();
                this.activeAction = this.actions.walk;
            }
            this.actions.walk.paused = false;
        } else {
            this.actions.walk.paused = true;
        }
    }

    getHeightAt(position) {
        for (let island of this.islandManager.getIslands()) {
            const dist = Math.hypot(position.x - island.position.x, position.z - island.position.z);
            if (dist <= island.radius) {
                return { height: island.position.y + island.height / 2 + 0.9, isValid: true };
            }
        }
        for (let bridge of this.islandManager.getBridges()) {
            const local = new THREE.Vector3(position.x, position.y, position.z).sub(bridge.position);
            const angle = -bridge.rotation.y;
            const rx = local.x * Math.cos(angle) - local.z * Math.sin(angle);
            const rz = local.x * Math.sin(angle) + local.z * Math.cos(angle);
            const halfW = bridge.width / 2, halfL = bridge.length / 2;
            if (Math.abs(rx) <= halfW && Math.abs(rz) <= halfL) {
                return { height: bridge.position.y + bridge.height / 2 + 0.9, isValid: true };
            }
        }
        return { height: 0.9, isValid: false };
    }

    lookAt(targetPos) {
        const dir = new THREE.Vector3().subVectors(targetPos, this.mesh.position);
        dir.y = 0; dir.normalize();
        const angle = Math.atan2(dir.x, dir.z);
        this.mesh.rotation.y = angle;
    }

    attackPlayer(player) {
        player.takeDamage(this.attackDamage);
        const flashHex = 0xff6600;
        for (const m of this.materialsWithEmissive) m.emissive.setHex(flashHex);
        clearTimeout(this.attackFlashTimeout);
        this.attackFlashTimeout = setTimeout(() => {
            for (const m of this.materialsWithEmissive) {
                const orig = (m.userData && m.userData._origEmissive) || 0x000000;
                m.emissive.setHex(orig);
            }
        }, 100);
    }

    takeDamage(dmg) {
        this.health -= dmg;
        const flashHex = 0xffff00;
        for (const m of this.materialsWithEmissive) m.emissive.setHex(flashHex);
        clearTimeout(this.damageFlashTimeout);
        this.damageFlashTimeout = setTimeout(() => {
            for (const m of this.materialsWithEmissive) {
                const orig = (m.userData && m.userData._origEmissive) || 0x000000;
                m.emissive.setHex(orig);
            }
        }, 100);
        if (this.health <= 0) this.die();
    }

    die() {
        this.isDead = true;
        const deathDuration = 0.5;
        const start = Date.now();
        const anim = () => {
            const elapsed = (Date.now() - start) / 1000;
            const p = Math.min(elapsed / deathDuration, 1);
            if (this.mesh) {
                this.mesh.scale.setScalar(1 - p);
                this.mesh.rotation.x = p * Math.PI;
                if (p < 1) requestAnimationFrame(anim);
                else this.remove();
            }
        };
        anim();
    }

    remove() {
        if (this.modelRoot) {
            this.scene.remove(this.modelRoot);
            this.modelRoot.traverse((o) => {
                if (o.isMesh) {
                    o.geometry && o.geometry.dispose?.();
                    if (Array.isArray(o.material)) o.material.forEach(m => m.dispose?.());
                    else o.material && o.material.dispose?.();
                }
            });
            this.modelRoot = null;
        }
        this.mesh = null;
        this.mixer = null;
        this.materialsWithEmissive = [];
    }
}