/**
 * Player.js – FBX (Mixamo) sin físicas
 * - WASD: Run
 * - Click izquierdo: Slash 
 */

class Player {
    constructor(scene, islandManager) {
        this.scene = scene;
        this.islandManager = islandManager;

        // Gameplay
        this.health = 100;
        this.speed = 8.5;
        this.isAttacking = false;
        this.attackCooldown = 0;
        this.attackRange = 4;
        this.attackDamage = 50;

        // Input
        this.keys = {};
        this.moveDirection = new THREE.Vector3(0, 0, -1);

        // Animación / FBX
        this.loader = new THREE.FBXLoader();
        this.model = null;
        this.mixer = null;
        this.actions = {};
        this.activeAction = null;
        this.animsReady = false;
        this.MODEL_SCALE = 0.017;

        // Root motion helpers
        this.animatedRoot = null;
        this.hipsBone = null;
        this.hipsInitialPos = null;
        this.slashDuration = 0.25;

        this.groundOffset = 1.0; 

        this._currentAttackHits = new Set();

        this.mesh = new THREE.Group();
        this.mesh.position.set(0, 3.5, 0); 
        this.scene.add(this.mesh);

        this._setupControls();

        this._loadFBXModelAndAnims();
    }

    _setupControls() {
        document.addEventListener('keydown', (e) => { this.keys[e.key.toLowerCase()] = true; });
        document.addEventListener('keyup', (e) => { this.keys[e.key.toLowerCase()] = false; });
        document.addEventListener('mousedown', (e) => {
            if (e.button === 0 && !this.isAttacking && this.attackCooldown <= 0) this.attack();
        });
    }

    _loadFBXModelAndAnims() {
        this.loader.setResourcePath('/models/character/'); 

        this.loader.load(
            '/models/character/character.fbx',
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
                            mat.color.setHex(0xcccccc);
                          }
                          if (mat.emissive) {
                            mat.emissive.setHex(0x0a0a0a);
                          }
                          mat.needsUpdate = true;
                        });
                      }
                    } 
                  });
                  
                this.mesh.add(fbx);
                this.model = fbx;
                this.animatedRoot = fbx;

                const box = new THREE.Box3().setFromObject(fbx);
                const footOffset = Math.max(0, -box.min.y); 
                this.groundOffset = Math.max(1.4, footOffset);

                // Hips
                this.hipsBone = this._findBoneByRegex(fbx, /(Hips|Root|Pelvis|mixamorig:?Hips)/i);
                if (this.hipsBone) this.hipsInitialPos = this.hipsBone.position.clone();

                // Mixer
                this.mixer = new THREE.AnimationMixer(this.model);
                this.mixer.addEventListener('finished', (ev) => {
                    if (!ev.action) return;
                    if (this.actions.slash && ev.action === this.actions.slash) {
                        this.isAttacking = false;
                        this._currentAttackHits.clear();
                        const moveIntent = this._isTryingToMove();
                        this._fadeTo(moveIntent ? 'run' : 'idle', 0.08);
                    }
                });

                const boneNameMap = this._collectBoneNameMap();

                const loadClip = (path, name) => new Promise((resolve) => {
                    this.loader.load(path, (animFBX) => {
                        let clip = animFBX.animations && animFBX.animations[0];
                        if (!clip) { console.warn(`Sin clip en ${path}`); return resolve(); }

                        clip = this._retargetClipToModel(clip, boneNameMap);
                        clip = this._makeClipInPlace(clip, {
                            rootNames: ['mixamorigHips', 'mixamorig:Hips', 'Hips'],
                            lockX: true, lockY: true, lockZ: true
                        });

                        const action = this.mixer.clipAction(clip);
                        action.enabled = true;

                        if (name === 'slash') {
                            action.setLoop(THREE.LoopOnce, 1);
                            action.clampWhenFinished = true;
                            const rawDuration = clip.duration;
                            const speed = 2.5;
                            action.timeScale = speed;
                            this.slashDuration = rawDuration / speed;
                        } else {
                            action.setLoop(THREE.LoopRepeat, Infinity);
                            action.clampWhenFinished = false;
                            action.timeScale = 1;
                        }

                        action.setEffectiveWeight(0);
                        action.play();
                        this.actions[name] = action;
                        resolve();
                    }, undefined, (err) => { console.error(`Error clip ${name}`, err); resolve(); });
                });

                Promise.all([
                    loadClip('/models/character/Idle.fbx',  'idle'),
                    loadClip('/models/character/Run.fbx',   'run'),
                    loadClip('/models/character/Slash.fbx', 'slash'),
                ]).then(() => {
                    this.animsReady = true;
                    this._fadeTo('idle', 0.01);
                });
            },
            undefined,
            (err) => console.error('Error cargando character.fbx', err)
        );
    }

    _findBoneByRegex(root, regex) {
        let found = null;
        root.traverse((o) => { if (!found && o.isBone && regex.test(o.name)) found = o; });
        if (!found) root.traverse((o) => { if (!found && o.isBone) found = o; });
        return found;
    }

    _collectBoneNameMap() {
        const map = new Map();
        this.model.traverse(o => {
            if (o.isBone && o.name) {
                const real = o.name;
                const norm = this._normalizeBoneName(real);
                if (!map.has(norm)) map.set(norm, real);
                const noMix = norm.replace('mixamorig', '');
                if (!map.has(noMix)) map.set(noMix, real);
                const withMix = ('mixamorig' + noMix);
                if (!map.has(withMix)) map.set(withMix, real);
            }
        });
        return map;
    }

    _normalizeBoneName(name) {
        let s = name.replace(/.*\|/g, '');
        s = s.replace(/:/g, '');
        return s.toLowerCase();
    }

    _retargetClipToModel(clip, boneNameMap) {
        for (const t of clip.tracks) {
            const parts = t.name.split('.');
            if (parts.length < 2) continue;
            const rawTarget = parts[0];
            const prop = parts.slice(1).join('.');
            const norm = this._normalizeBoneName(rawTarget);
            let real = boneNameMap.get(norm);
            if (!real) {
                const noMix = norm.replace('mixamorig', '');
                real = boneNameMap.get(noMix) || boneNameMap.get('mixamorig' + noMix);
            }
            if (real && real + '.' + prop !== t.name) t.name = `${real}.${prop}`;
        }
        return clip;
    }

    _makeClipInPlace(clip, { rootNames = ['mixamorigHips','Hips'], lockX = true, lockY = true, lockZ = true }) {
        for (const t of clip.tracks) {
            if (!/\.position$/.test(t.name)) continue;
            const rootName = t.name.split('.')[0];
            const isRoot = rootNames.some(r => r.toLowerCase() === rootName.toLowerCase());
            if (!isRoot) continue;
            const v = t.values;
            for (let k = 0; k < v.length; k += 3) {
                if (lockX) v[k + 0] = 0;
                if (lockY) v[k + 1] = 0;
                if (lockZ) v[k + 2] = 0;
            }
        }
        return clip;
    }

    _fadeTo(name, duration) {
        if (!this.animsReady || !this.actions[name]) return;
        const next = this.actions[name];
        if (this.activeAction === next) return;

        next.reset();
        next.setEffectiveWeight(1);
        if (this.activeAction) this.activeAction.crossFadeTo(next, duration, true);
        else next.time = 0;
        this.activeAction = next;
    }

    update(deltaTime, enemies) {
        if (this.mixer) {
            this.mixer.update(deltaTime);
            if (this.animatedRoot) { this.animatedRoot.position.x = 0; this.animatedRoot.position.z = 0; }
            if (this.hipsBone && this.hipsInitialPos) {
                this.hipsBone.position.x = this.hipsInitialPos.x;
                this.hipsBone.position.z = this.hipsInitialPos.z;
            }
        }

        if (this.attackCooldown > 0) this.attackCooldown -= deltaTime;

        this._snapToSurface();

        if (this.isAttacking) {
            if (enemies && enemies.length) {
                const hit = this.checkAttackHit(enemies);
                for (const e of hit) e.takeDamage(this.attackDamage);
            }
            return;
        }

        if (this.health <= 0) return;

        // Movimiento WASD
        const mv = new THREE.Vector3();
        if (this.keys['w']) mv.z -= 1;
        if (this.keys['s']) mv.z += 1;
        if (this.keys['a']) mv.x -= 1;
        if (this.keys['d']) mv.x += 1;

        const moving = mv.lengthSq() > 0;
        if (moving) {
            mv.normalize();
            this.moveDirection.copy(mv);
            const moveAmount = this.speed * deltaTime;
            const safety = 0.35;

            const tryStep = (amt) => {
                const np = this.mesh.position.clone().addScaledVector(mv, amt);
                if (this.islandManager.isPositionValid(np, safety)) {
                    this.mesh.position.copy(np);
                    this.islandManager.resolveCharacterCollisions(this.mesh.position, safety);
                    return true;
                }
                return false;
            };

            if (!tryStep(moveAmount)) {
                if (!tryStep(moveAmount * 0.6)) {
                    if (!tryStep(moveAmount * 0.4)) {
                        const xOnly = this.mesh.position.clone(); xOnly.x += mv.x * moveAmount;
                        const zOnly = this.mesh.position.clone(); zOnly.z += mv.z * moveAmount;
                        if (this.islandManager.isPositionValid(xOnly, safety)) {
                            this.mesh.position.copy(xOnly);
                            this.islandManager.resolveCharacterCollisions(this.mesh.position, safety);
                        } else if (this.islandManager.isPositionValid(zOnly, safety)) {
                            this.mesh.position.copy(zOnly);
                            this.islandManager.resolveCharacterCollisions(this.mesh.position, safety);
                        }
                    }
                }
            }

            const angle = Math.atan2(mv.x, mv.z);
            this.mesh.rotation.y = angle;
        }

        this._snapToSurface();

        if (this.animsReady) this._fadeTo(moving ? 'run' : 'idle', moving ? 0.08 : 0.12);
    }

    _snapToSurface() {
        const hit = this.islandManager.getSurfaceHeightAt(this.mesh.position, 300);
        if (hit.ok) {
            const EPS = 0.04;
            this.mesh.position.y = hit.y + this.groundOffset + EPS;
        }
    }

    // --- Ataque ---
    attack() {
        if (!this.animsReady || !this.actions.slash) return;
        this._resetAttackWindows();
        this._currentAttackHits.clear(); 
        this.isAttacking = true;

        this._fadeTo('slash', 0.05);
        this.attackCooldown = Math.max(0.05, this.slashDuration * 0.9);

        setTimeout(() => {
            if (this.isAttacking) {
                this.isAttacking = false;
                this._currentAttackHits.clear();
                this._fadeTo(this._isTryingToMove() ? 'run' : 'idle', 0.08);
            }
        }, Math.max(80, this.slashDuration * 1000 + 60));
    }

    _isTryingToMove() { return !!(this.keys['w'] || this.keys['a'] || this.keys['s'] || this.keys['d']); }

    checkAttackHit(enemies) {
        if (!this.isAttacking || !this.slashDuration) return [];
        
        const out = [];
        const P = this.mesh.position;
        const dir = new THREE.Vector3(Math.sin(this.mesh.rotation.y), 0, Math.cos(this.mesh.rotation.y));
        
        for (const e of enemies) {
            if (e.isDead) continue;
            if (this._currentAttackHits.has(e)) continue; 
            
            const E = e.mesh.position;
            const d = P.distanceTo(E);
            if (d < this.attackRange) {
                const toE = new THREE.Vector3().subVectors(E, P).normalize();
                if (dir.dot(toE) > 0.4) {
                    out.push(e);
                    this._currentAttackHits.add(e); 
                }
            }
        }
        return out;
    }

    _resetAttackWindows() {
        this._hitStartTime = null;
        this._hitWindowConsumed = false;
    }

    // Utilidades
    takeDamage(dmg) { this.health = Math.max(0, this.health - dmg); }
    getPosition() { return this.mesh.position; }
    isDead() { return this.health <= 0; }
}