const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * ═══════════════════════════════════════════════════════════
 *   GITHUB ÖĞRENME SENKRONİZASYON MOTORU
 *   Makinenin öğrendiği her şeyi GitHub'a kaydeder
 * ═══════════════════════════════════════════════════════════
 */

class GitHubLearningSync {
  
  constructor(config = {}) {
    this.config = {
      repoUrl: config.repoUrl || process.env.GITHUB_LEARNING_REPO || '',
      branch: config.branch || 'main',
      token: config.token || process.env.GITHUB_TOKEN || '',
      localPath: config.localPath || path.join(__dirname, '..', '..', 'machine_learning_data'),
      commitAuthor: config.commitAuthor || 'Machine Learning Bot',
      commitEmail: config.commitEmail || 'bot@crypto-trading.ai',
      autoSync: config.autoSync !== false,
      syncInterval: config.syncInterval || 30,
    };

    this.paths = {
      root: this.config.localPath,
      patterns: path.join(this.config.localPath, 'patterns'),
      models: path.join(this.config.localPath, 'models'),
      stats: path.join(this.config.localPath, 'stats'),
    };

    this.state = {
      initialized: false,
      lastSync: null,
      totalSyncs: 0,
      errors: []
    };

    this.init();
  }

  init() {
    try {
      Object.values(this.paths).forEach(dir => {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      });

      if (this.isGitRepo()) {
        console.log('[GITHUB] Mevcut repo bulundu');
        this.pull();
      } else {
        console.log('[GITHUB] Yeni repo oluşturuluyor...');
        this.initGitRepo();
      }

      this.state.initialized = true;
      console.log('[GITHUB] ✅ Öğrenme senkronizasyonu hazır');
    } catch (e) {
      console.error('[GITHUB] Başlatma hatası:', e.message);
    }
  }

  initGitRepo() {
    try {
      execSync('git init', { cwd: this.config.localPath });

      const gitignore = `node_modules/\n.env\n*.tmp\n*.log\n.DS_Store\n*.zip\n`;
      fs.writeFileSync(path.join(this.config.localPath, '.gitignore'), gitignore);

      const readme = `# 🤖 Crypto Trading Machine Learning Data\n\nBu repo, trading botun öğrenme verilerini içerir.\n\nSon güncelleme: ${new Date().toISOString()}\n`;
      fs.writeFileSync(path.join(this.config.localPath, 'README.md'), readme);

      execSync('git add .', { cwd: this.config.localPath });
      execSync('git commit -m "🤖 İlk öğrenme verisi"', { cwd: this.config.localPath });

      if (this.config.repoUrl) {
        try {
          execSync(`git remote add origin ${this.config.repoUrl}`, { cwd: this.config.localPath });
        } catch (e) {
          // Remote zaten varsa hata verme
        }
      }

      console.log('[GITHUB] Repo oluşturuldu');
    } catch (e) {
      console.error('[GITHUB] Repo oluşturma hatası:', e.message);
    }
  }

  async saveMachineState(machineEngine, simulationEngine = null) {
    if (!this.state.initialized) return false;

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

      // Pattern kütüphanesi
      if (machineEngine.memory?.patternLibrary) {
        const patterns = machineEngine.memory.patternLibrary;
        const patternFile = path.join(this.paths.patterns, `patterns_${timestamp}.json`);
        fs.writeFileSync(patternFile, JSON.stringify({
          timestamp, totalPatterns: patterns.length,
          patterns: patterns.slice(-500)
        }, null, 2));

        const latestPatternFile = path.join(this.paths.patterns, 'latest_patterns.json');
        fs.writeFileSync(latestPatternFile, JSON.stringify({
          timestamp, totalPatterns: patterns.length,
          patterns: patterns.slice(-100)
        }, null, 2));
      }

      // Gösterge ağırlıkları
      if (machineEngine.indicatorWeights) {
        const weightsFile = path.join(this.paths.models, `weights_${timestamp}.json`);
        fs.writeFileSync(weightsFile, JSON.stringify({
          timestamp, weights: machineEngine.indicatorWeights,
          threshold: machineEngine.settings?.confidenceRequired
        }, null, 2));

        const latestWeightsFile = path.join(this.paths.models, 'latest_weights.json');
        fs.writeFileSync(latestWeightsFile, JSON.stringify({
          timestamp, weights: machineEngine.indicatorWeights
        }, null, 2));
      }

      // Sinyal geçmişi
      if (machineEngine.memory?.outcomes) {
        const outcomes = machineEngine.memory.outcomes;
        const recentOutcomes = outcomes.slice(-100);
        const winRate = recentOutcomes.filter(o => o.profitable).length / Math.max(1, recentOutcomes.length);
        const outcomesFile = path.join(this.paths.stats, `outcomes_${timestamp}.json`);
        fs.writeFileSync(outcomesFile, JSON.stringify({
          timestamp, totalOutcomes: outcomes.length, recentWinRate: winRate,
          summary: {
            total: outcomes.length,
            wins: outcomes.filter(o => o.profitable).length,
            losses: outcomes.filter(o => !o.profitable).length
          }
        }, null, 2));
      }

      // Simülasyon durumu
      if (simulationEngine?.getStats) {
        const simStats = simulationEngine.getStats();
        const simFile = path.join(this.paths.stats, `simulation_${timestamp}.json`);
        fs.writeFileSync(simFile, JSON.stringify({ timestamp, stats: simStats }, null, 2));
      }

      // Öğrenme özeti (her zaman güncel)
      const summaryFile = path.join(this.paths.root, 'learning_summary.json');
      fs.writeFileSync(summaryFile, JSON.stringify({
        lastUpdated: timestamp,
        totalSignals: machineEngine.memory?.signals?.length || 0,
        totalPatterns: machineEngine.memory?.patternLibrary?.length || 0,
        totalOutcomes: machineEngine.memory?.outcomes?.length || 0,
        indicatorWeights: machineEngine.indicatorWeights,
        adaptiveThreshold: machineEngine.settings?.confidenceRequired || 0.70
      }, null, 2));

      this.state.lastSync = timestamp;
      console.log(`[GITHUB] 💾 Durum kaydedildi (${timestamp})`);
      return true;
    } catch (e) {
      console.error('[GITHUB] Kaydetme hatası:', e.message);
      this.state.errors.push({ time: new Date().toISOString(), error: e.message });
      return false;
    }
  }

  async pushToGitHub(commitMessage = null) {
    if (!this.state.initialized) return false;

    try {
      const message = commitMessage || `🤖 Öğrenme güncellemesi - ${new Date().toISOString()}`;

      execSync('git add .', { cwd: this.config.localPath });
      const status = execSync('git status --porcelain', { cwd: this.config.localPath }).toString();

      if (!status.trim()) {
        console.log('[GITHUB] Değişiklik yok');
        return true;
      }

      execSync(`git commit -m "${message}"`, { cwd: this.config.localPath });

      if (this.config.token && this.config.repoUrl) {
        const authenticatedUrl = this.config.repoUrl.replace('https://', `https://${this.config.token}@`);
        try {
          execSync(`git remote set-url origin ${authenticatedUrl}`, { cwd: this.config.localPath });
        } catch (e) {
          execSync(`git remote add origin ${authenticatedUrl}`, { cwd: this.config.localPath });
        }
        execSync(`git push -u origin ${this.config.branch}`, { cwd: this.config.localPath });
      }

      this.state.totalSyncs++;
      console.log(`[GITHUB] ✅ Push başarılı (${this.state.totalSyncs}. sync)`);
      return true;
    } catch (e) {
      console.error('[GITHUB] Push hatası:', e.message);
      this.state.errors.push({ time: new Date().toISOString(), error: e.message });
      return false;
    }
  }

  pull() {
    if (!this.state.initialized) return false;
    try {
      execSync('git pull', { cwd: this.config.localPath });
      console.log('[GITHUB] ✅ Güncellemeler alındı');
      return true;
    } catch (e) {
      console.log('[GITHUB] Pull bekleniyor (ilk kurulum):', e.message);
      return false;
    }
  }

  loadLearningData() {
    try {
      const summaryFile = path.join(this.paths.root, 'learning_summary.json');
      if (!fs.existsSync(summaryFile)) return null;

      const data = JSON.parse(fs.readFileSync(summaryFile, 'utf8'));

      const weightsFile = path.join(this.paths.models, 'latest_weights.json');
      if (fs.existsSync(weightsFile)) {
        data.weights = JSON.parse(fs.readFileSync(weightsFile, 'utf8'));
      }

      const patternsFile = path.join(this.paths.patterns, 'latest_patterns.json');
      if (fs.existsSync(patternsFile)) {
        data.patterns = JSON.parse(fs.readFileSync(patternsFile, 'utf8'));
      }

      console.log(`[GITHUB] 📂 Öğrenme verisi yüklendi (${data.lastUpdated})`);
      return data;
    } catch (e) {
      console.error('[GITHUB] Yükleme hatası:', e.message);
      return null;
    }
  }

  applyLearningToMachine(machineEngine, learningData) {
    if (!learningData || !machineEngine) return false;

    try {
      if (learningData.weights?.weights) {
        machineEngine.indicatorWeights = learningData.weights.weights;
      }
      if (learningData.adaptiveThreshold) {
        machineEngine.settings.confidenceRequired = learningData.adaptiveThreshold;
      }
      if (learningData.patterns?.patterns) {
        machineEngine.memory.patternLibrary = learningData.patterns.patterns;
      }
      console.log(`[GITHUB] ✅ Öğrenme makineye uygulandı`);
      return true;
    } catch (e) {
      console.error('[GITHUB] Uygulama hatası:', e.message);
      return false;
    }
  }

  startAutoSync(machineEngine, simulationEngine) {
    if (!this.config.autoSync) return;

    console.log(`[GITHUB] 🔄 Otomatik sync başladı (${this.config.syncInterval}dk)`);
    this.syncInterval = setInterval(async () => {
      await this.saveMachineState(machineEngine, simulationEngine);
      await this.pushToGitHub();
    }, this.config.syncInterval * 60 * 1000);
  }

  stopAutoSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
  }

  getStatus() {
    return {
      ...this.state,
      config: {
        repoUrl: this.config.repoUrl ? '✅' : '❌',
        token: this.config.token ? '✅' : '❌',
        autoSync: this.config.autoSync
      }
    };
  }

  isGitRepo() {
    try {
      execSync('git rev-parse --is-inside-work-tree', { cwd: this.config.localPath });
      return true;
    } catch {
      return false;
    }
  }
}

// ═══════════════════════════════════════════════════════════
// ENTEGRE ÖĞRENME YÖNETİCİSİ
// ═══════════════════════════════════════════════════════════

class IntegratedLearningManager {
  
  constructor(githubConfig = {}) {
    this.github = new GitHubLearningSync(githubConfig);
    this.machine = null;
    this.simulation = null;
  }

  async initialize(machineEngine, simulationEngine) {
    this.machine = machineEngine;
    this.simulation = simulationEngine;

    console.log('[ÖĞRENME] 🚀 Başlatılıyor...');

    const learningData = this.github.loadLearningData();
    if (learningData) {
      this.github.applyLearningToMachine(this.machine, learningData);
      console.log('[ÖĞRENME] ✅ Geçmiş öğrenmeler yüklendi');
    } else {
      console.log('[ÖĞRENME] 📝 Sıfırdan başlıyor');
    }

    this.github.startAutoSync(this.machine, this.simulation);

    return { loaded: !!learningData, summary: learningData?.lastUpdated || 'Yeni' };
  }

  async saveAndSync(commitMessage = null) {
    if (!this.machine) return false;
    await this.github.saveMachineState(this.machine, this.simulation);
    await this.github.pushToGitHub(commitMessage);
    return true;
  }

  getReport() {
    return {
      github: this.github.getStatus(),
      machine: {
        patterns: this.machine?.memory?.patternLibrary?.length || 0,
        signals: this.machine?.memory?.signals?.length || 0,
        outcomes: this.machine?.memory?.outcomes?.length || 0,
        threshold: this.machine?.settings?.confidenceRequired || 0
      }
    };
  }

  stop() {
    this.github.stopAutoSync();
  }
}

module.exports = { GitHubLearningSync, IntegratedLearningManager };
