/**
 * WaveManager.js
 * Maneja el sistema de oleadas de enemigos con 3 tipos diferentes
 */

class WaveManager {
    constructor(scene, islandManager) {
        this.scene = scene;
        this.islandManager = islandManager;

        this.currentWave = 1;
        this.enemies = [];
        this.enemiesKilled = 0;
        this.isSpawning = false;
        this.waveActive = false;

        if (!this.islandManager || typeof this.islandManager.isPositionValid !== 'function') {
            console.warn('IslandManager no tiene los métodos esperados todavía.');
        }
    }

    startWave() {
        if (this.waveActive) return;

        if (!this.islandManager || typeof this.islandManager.getRandomSpawnPosition !== 'function') {
            console.warn('IslandManager no listo; reintentando startWave en 100ms');
            setTimeout(() => this.startWave(), 100);
            return;
        }

        this._clearAllMarkers();

        // Cuenta atrás 3-2-1 
        const countdownEl = document.getElementById && document.getElementById('countdown');
        let count = 3;
        if (countdownEl) {
            countdownEl.style.display = 'block';
            countdownEl.textContent = String(count);
        }

        const enemyCount = this.getEnemyCount();
        const frozenEnemies = [];
        for (let i = 0; i < enemyCount; i++) {
            const e = this.spawnEnemy();
            if (e) {
                e.frozen = true;
                frozenEnemies.push(e);
            }
        }

        const tick = () => {
            count--;
            if (countdownEl) countdownEl.textContent = count > 0 ? String(count) : '¡Ya!';
            if (count > 0) {
                setTimeout(tick, 1000);
            } else {
                setTimeout(() => {
                    if (countdownEl) countdownEl.style.display = 'none';

                    this.waveActive = true;
                    this.isSpawning = true;

                    for (const e of frozenEnemies) if (e) e.frozen = false;
                    this.isSpawning = false;
                }, 600);
            }
        };
        setTimeout(tick, 1000);
    }

    getEnemyCount() {
        const base = 5;
        const scale = 3;
        const bonusEvery5 = Math.floor((this.currentWave - 1) / 5) * 3;
        return base + (this.currentWave - 1) * scale + bonusEvery5;
    }

    
    getEnemyTypeForWave() {
        // Oleadas 1-2: solo básicos
        if (this.currentWave <= 2) {
            return 'basic';
        }
        
        // Oleada 3+: mezcla de tipos
        const rand = Math.random();
        
        // Oleadas tempranas (3-5): más básicos, algunos rápidos
        if (this.currentWave <= 5) {
            if (rand < 0.6) return 'basic';
            if (rand < 0.9) return 'fast';
            return 'tank';
        }
        
        // Oleadas medias (6-10): balance
        if (this.currentWave <= 10) {
            if (rand < 0.4) return 'basic';
            if (rand < 0.7) return 'fast';
            return 'tank';
        }
        
        // Oleadas avanzadas (11+): más tanques y rápidos
        if (rand < 0.3) return 'basic';
        if (rand < 0.65) return 'fast';
        return 'tank';
    }

    spawnEnemy() {
        if (!this.islandManager || typeof this.islandManager.getRandomSpawnPosition !== 'function') {
            console.warn('No se puede spawnear: IslandManager no listo.');
            return null;
        }
        const spawnPos = this.islandManager.getRandomSpawnPosition();
        const enemyType = this.getEnemyTypeForWave();
        const enemy = new Enemy(this.scene, spawnPos, this.islandManager, enemyType);
        this._attachMinimapMarker(enemy);
        this.enemies.push(enemy);
        return enemy;
    }

    update(deltaTime, player) {
        const aliveEnemies = this.enemies.filter(e => !e.isDead);
        for (let enemy of aliveEnemies) enemy.update(deltaTime, player, aliveEnemies);

        if (this.waveActive && !this.isSpawning && aliveEnemies.length === 0) {
            this.waveComplete();
        }
    }

    checkPlayerAttacks(player) {
        const hitEnemies = player.checkAttackHit(this.enemies);
        for (let enemy of hitEnemies) {
            if (!enemy.isDead) {
                enemy.takeDamage(player.attackDamage);
                if (enemy.isDead) {
                    this.enemiesKilled++;
                    this._removeMinimapMarker(enemy);
                }
            }
        }
    }

    waveComplete() {
        this.waveActive = false;
        this.currentWave++;
        this._clearAllMarkers();
        this.enemies = this.enemies.filter(e => !e.isDead);
        const menu = document.getElementById && document.getElementById('nextWaveMenu');
        if (menu) menu.style.display = 'flex';
    }

    getAliveEnemyCount() { return this.enemies.filter(e => !e.isDead).length; }
    getCurrentWave() { return this.currentWave; }
    getTotalKills() { return this.enemiesKilled; }

    _attachMinimapMarker(enemy) {
        if (!THREE) return;
        const markerSize = 2.2;
        const markerGeo = new THREE.PlaneGeometry(markerSize, markerSize);
        const markerMat = new THREE.MeshBasicMaterial({ color: 0xffd100, depthTest: false, transparent: true });
        const marker = new THREE.Mesh(markerGeo, markerMat);
        marker.rotation.x = -Math.PI / 2;
        marker.position.copy(enemy.modelRoot.position);
        marker.position.y += 0.1;
        marker.layers.set(2);
        marker.renderOrder = 999;
        this.scene.add(marker);

        enemy._minimapMarker = marker;

        const updateMarker = () => {
            if (enemy.isDead) return;
            marker.position.x = enemy.modelRoot.position.x;
            marker.position.z = enemy.modelRoot.position.z;
        };
        const originalUpdate = enemy.update.bind(enemy);
        enemy.update = (dt, player, alive) => {
            originalUpdate(dt, player, alive);
            updateMarker();
            if (enemy.isDead && marker.parent) {
                this.scene.remove(marker);
                marker.parent = null;
                marker.geometry.dispose();
                marker.material.dispose();
            }
        };
    }

    _removeMinimapMarker(enemy) {
        const marker = enemy && enemy._minimapMarker;
        if (marker && marker.parent) {
            this.scene.remove(marker);
            marker.parent = null;
            marker.geometry && marker.geometry.dispose?.();
            marker.material && marker.material.dispose?.();
        }
        if (enemy) enemy._minimapMarker = null;
    }

    _clearAllMarkers() {
        if (!Array.isArray(this.enemies)) return;
        for (const e of this.enemies) {
            if (e && e._minimapMarker) this._removeMinimapMarker(e);
        }
    }
}