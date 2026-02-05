/**
 * XP.JS
 * Responsável pela lógica matemática de pontos, ORQUESTRAÇÃO AUDIOVISUAL e LOGS.
 * VERSÃO: V23 - SAFETY LOCK & DECIMAL PRECISION
 */

window.XPManager = {

    // Cache para a visualização atual
    currentViewCache: [],

    init: function() {
        console.log("Site C: XPManager V23 (Safety Lock) Carregado");
        document.addEventListener('SiteC_DataReady', () => {
            this.sanitizeHistory();
            this.injectManualControls();
            this.updateUI();
            this.renderLogs();
        });
    },

    /**
     * FUNÇÃO DE CURA (MANTIDA)
     */
    sanitizeHistory: function() {
        const history = window.GlobalApp.data.xp.history;
        if (!history || history.length === 0) return;

        let fixedCount = 0;
        const now = Date.now();
        const todayStr = window.GlobalApp.formatDate(new Date());

        history.forEach(entry => {
            let needsFix = false;

            if (!entry.timestamp) {
                const dStr = entry.date || "2020-01-01";
                const tStr = entry.time || "12:00";
                const rebuilt = new Date(`${dStr}T${tStr}`).getTime();
                entry.timestamp = isNaN(rebuilt) ? 0 : rebuilt;
                needsFix = true;
            }

            if (entry.timestamp > (now + 60000)) {
                if (entry.date === todayStr) {
                    entry.timestamp = now - 1000;
                } else {
                    const dStr = entry.date || "2020-01-01";
                    const tStr = entry.time || "12:00";
                    const rebuilt = new Date(`${dStr}T${tStr}`).getTime();
                    entry.timestamp = rebuilt;
                }
                needsFix = true;
            }

            if (entry.date !== todayStr && (now - entry.timestamp < 86400000)) {
                 const dStr = entry.date;
                 if (dStr < todayStr) {
                    const tStr = entry.time || "12:00";
                    entry.timestamp = new Date(`${dStr}T${tStr}`).getTime();
                    needsFix = true;
                 }
            }

            if (needsFix) fixedCount++;
        });

        if (fixedCount > 0) {
            console.log(`XPManager: ${fixedCount} logs corrigidos.`);
            window.GlobalApp.saveData();
        }
    },

    injectManualControls: function() {
        const header = document.querySelector('#section-logs .section-header');
        if (header && !document.getElementById('btn-manual-xp')) {
            const btn = document.createElement('button');
            btn.id = 'btn-manual-xp';
            btn.textContent = '🛠️ Ajuste Manual';
            btn.className = "habit-tab-btn";
            btn.style.marginLeft = "auto";
            btn.onclick = () => this.performManualAdjustment();
            header.appendChild(btn);
        }
    },

    performManualAdjustment: async function() {
        if (window.SoundManager) window.SoundManager.play('click');

        const amountStr = await prompt("Valor de XP (+/-):", "0");
        if (!amountStr) return;

        // Alterado para parseFloat para permitir decimais manuais
        const amount = parseFloat(amountStr);
        if (isNaN(amount) || amount === 0) return;

        const reason = await prompt("Motivo:", "Ajuste Manual");
        this.gainXP(amount, reason || "Ajuste", { forceFlat: true });
    },

    /**
     * Função Principal de Ganho de XP
     */
    gainXP: async function(baseAmount, source, options = {}) {
        // TRAVA DE SEGURANÇA (DIET LOCKDOWN)
        if (window.GlobalApp.data.xp && window.GlobalApp.data.xp.blocked) return;

        // Garante que a entrada seja tratada como float
        let currentTotal = parseFloat(baseAmount);
        let bonusVal = 0;
        let probMult = 1;

        // 1. Calcula e Soma o Streak PRIMEIRO (se não for ajuste manual ou milestone)
        if (baseAmount > 0 && !options.forceFlat && !options.isMilestone) {
            // Bônus de Streak
            if (options.streak && options.streak > 1) {
                // Lógica: 10% por dia até 30 dias (300% ou 3.0x base)
                let streakMultiplier = (options.streak <= 30) ? (options.streak - 1) * 0.10 : 3.0;
                
                // Calcula bônus com precisão decimal
                bonusVal = parseFloat((baseAmount * streakMultiplier).toFixed(1));

                // Soma o bônus ao montante antes de aplicar a sorte
                currentTotal += bonusVal;
            }

            // 2. Calcula Multiplicador de Sorte
            const rand = Math.random() * 100;
            if (rand >= 95) {
                probMult = 3;
            } else if (rand >= 85) {
                probMult = 2;
            }

            // 3. Aplica a sorte sobre o TOTAL (Base + Streak)
            currentTotal = currentTotal * probMult;
        }

        // Finaliza com 1 casa decimal (ex: 6.1) em vez de arredondar para inteiro
        const finalXP = parseFloat(currentTotal.toFixed(1));
        const xpState = window.GlobalApp.data.xp;

        // Atualiza dados globais com segurança decimal
        xpState.current = parseFloat((xpState.current + finalXP).toFixed(1));
        xpState.total = parseFloat((xpState.total + finalXP).toFixed(1));

        // Efeitos Visuais e Sonoros
        if (finalXP > 0) {
            this.spawnFloatingText(finalXP, probMult, (baseAmount + bonusVal));
            if (window.SoundManager) await window.SoundManager.play('xp');
        }

        this.addRawLog({
            amount: finalXP,
            baseXP: baseAmount,
            source: source,
            habitId: options.habitId,
            probMult: probMult,
            streak: options.streak
        });

        window.GlobalApp.saveData();
        await this.checkLevelChange();
        this.updateUI();
        this.renderLogs();
    },

    addRawLog: function(data) {
        const history = window.GlobalApp.data.xp.history;
        const today = window.GlobalApp.formatDate(new Date());
        const timeNow = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

        const newEntry = {
            date: today,
            time: timeNow,
            timestamp: Date.now(),
            source: data.source,
            amount: data.amount,
            baseXP: data.baseXP,
            count: 1,
            habitId: data.habitId || null,
            streak: data.streak || 0,
            luck2: data.probMult === 2 ? 1 : 0,
            luck3: data.probMult === 3 ? 1 : 0
        };

        history.push(newEntry);
    },

    getConsolidatedView: function() {
        const rawHistory = window.GlobalApp.data.xp.history || [];
        if (rawHistory.length === 0) return [];

        const map = new Map();

        rawHistory.forEach((entry, realIndex) => {
            if (!entry.habitId) return;

            const entryDate = entry.date || "2020-01-01";
            const uniqueKey = `${entryDate}|${entry.habitId}`;

            let entryTs = entry.timestamp || 0;

            if (map.has(uniqueKey)) {
                const group = map.get(uniqueKey);

                // Soma segura de decimais
                group.amount = parseFloat((group.amount + entry.amount).toFixed(1));
                
                group.count += (entry.count || 1);
                group.luck2 += (entry.luck2 || 0);
                group.luck3 += (entry.luck3 || 0);

                group.time = entry.time;
                if (entry.streak > group.streak) group.streak = entry.streak;
                if (entry.baseXP) group.baseXP = entry.baseXP;

                if (entryTs > group.timestamp) group.timestamp = entryTs;

                group.rawIndices.push(realIndex);

            } else {
                const newGroup = {
                    ...entry,
                    date: entryDate,
                    count: entry.count || 1,
                    luck2: entry.luck2 || 0,
                    luck3: entry.luck3 || 0,
                    timestamp: entryTs,
                    rawIndices: [realIndex]
                };

                if (!newGroup.baseXP && newGroup.count > 0) {
                    // Média com 1 casa decimal
                    newGroup.baseXP = parseFloat((newGroup.amount / newGroup.count).toFixed(1));
                }

                map.set(uniqueKey, newGroup);
            }
        });

        const sorted = Array.from(map.values()).sort((a, b) => {
            const dateDiff = b.date.localeCompare(a.date);
            if (dateDiff !== 0) return dateDiff;
            return b.timestamp - a.timestamp;
        });

        this.currentViewCache = sorted;
        return sorted;
    },

    formatDateHeader: function(dateIsoString) {
        if (!dateIsoString) return "Desconhecido";

        const today = window.GlobalApp.formatDate(new Date());
        const d = new Date();
        d.setDate(d.getDate() - 1);
        const yesterday = window.GlobalApp.formatDate(d);

        if (dateIsoString === today) return "📅 HOJE";
        if (dateIsoString === yesterday) return "📅 ONTEM";

        const parts = dateIsoString.split('-');
        if (parts.length === 3) return `📅 ${parts[2]}/${parts[1]}/${parts[0]}`;
        return `📅 ${dateIsoString}`;
    },

    renderLogs: function() {
        const tbody = document.getElementById('xp-log-body');
        if(!tbody) return;

        const viewList = this.getConsolidatedView();
        tbody.innerHTML = '';

        let lastDateRendered = null;

        if (viewList.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:#666;">Nenhum registro de hábito recente.</td></tr>';
            return;
        }

        viewList.forEach((log, index) => {
            if (log.date !== lastDateRendered) {
                const headerRow = document.createElement('tr');
                const label = this.formatDateHeader(log.date);

                headerRow.innerHTML = `
                    <td colspan="4" style="
                        background-color: rgba(255, 255, 255, 0.05);
                        color: var(--accent-color);
                        font-weight: bold;
                        padding: 8px 12px;
                        font-size: 0.85rem;
                        border-bottom: 1px solid rgba(255,255,255,0.1);
                        text-transform: uppercase;
                        letter-spacing: 1px;
                        margin-top: 10px;
                    ">
                        ${label}
                    </td>
                `;
                tbody.appendChild(headerRow);
                lastDateRendered = log.date;
            }

            const tr = document.createElement('tr');

            const isToday = log.date === window.GlobalApp.formatDate(new Date());
            if (isToday && (Date.now() - log.timestamp < 2500)) {
                tr.classList.add('new-log-entry');
            }

            let contentHtml = `<span style="font-weight:500; color:var(--text-primary); margin-right:8px;">${log.source}</span>`;

            if (log.streak > 1) {
                contentHtml += `<span title="Sequência" style="color:#ffab00; background:rgba(255,171,0,0.1); padding:1px 5px; border-radius:4px; font-size:0.75em; font-weight:bold; vertical-align:middle;">🔥 ${log.streak}</span>`;
            }

            if (log.baseXP > 0) {
                contentHtml += `<span style="color:var(--text-secondary); opacity:0.6; font-size:0.75em; margin-left:8px;">(${log.baseXP} xp)</span>`;
            }

            if (log.count > 1) {
                contentHtml += ` <span style="background:rgba(255,255,255,0.1); padding:1px 6px; border-radius:4px; font-size:0.75em; margin-left:8px; border:1px solid rgba(255,255,255,0.15); vertical-align:middle;">x${log.count}</span>`;
            }

            let detailsHtml = '';
            if (log.luck2 > 0) detailsHtml += `<span title="Sorte (2x)" style="color:#00e676; background:rgba(0,230,118,0.1); padding:2px 6px; border-radius:4px; margin-right:5px; font-size:0.85em;">🍀 ${log.luck2}</span>`;
            if (log.luck3 > 0) detailsHtml += `<span title="Sorte Grande (3x)" style="color:#ff5252; background:rgba(255,82,82,0.1); padding:2px 6px; border-radius:4px; margin-right:5px; font-size:0.85em;">🌟 ${log.luck3}</span>`;

            const colorStyle = log.amount < 0 ? 'color: var(--danger-color); font-weight: bold;' : '';
            const sign = log.amount > 0 ? '+' : '';

            const deleteTitle = log.count > 1 ? "Desfazer última ação deste grupo (LIFO)" : "Remover registro";
            const deleteBtn = `<button class="btn-delete-log" title="${deleteTitle}" onclick="window.XPManager.deleteLog(${index})">✕</button>`;

            tr.innerHTML = `
                <td style="font-size:0.8em; color:#666; width:80px;">${log.time}</td>
                <td>${contentHtml}</td>
                <td>${detailsHtml}</td>
                <td style="${colorStyle} text-align:right;">${sign}${log.amount} XP ${deleteBtn}</td>
            `;

            tbody.appendChild(tr);
        });
    },

    animateBarTo: function(percentage, duration = 'auto') {
        return new Promise(resolve => {
            const bar = document.getElementById('xp-bar-fill');
            if (!bar) { resolve(); return; }

            let ms = (duration === 'auto' && window.SoundManager)
                     ? window.SoundManager.getDuration('xp')
                     : (duration === 'auto' ? 1000 : duration);

            if (ms === 0) {
                bar.style.transition = 'none';
                bar.style.width = `${percentage}%`;
                void bar.offsetWidth;
                bar.style.transition = `width ${window.SoundManager ? window.SoundManager.getDuration('xp') : 1000}ms ease-out`;
                resolve();
            } else {
                bar.style.transition = `width ${ms}ms ease-out`;
                bar.style.width = `${percentage}%`;
                setTimeout(resolve, ms);
            }
        });
    },

    checkLevelChange: async function() {
        const xpState = window.GlobalApp.data.xp;
        if (xpState.current < 0) { await this.checkLevelDown(); return; }

        let needed = xpState.level * 100;
        
        // Loop para suportar múltiplos níveis de uma vez
        while (xpState.current >= needed) {
            this.updateUITextOnly();
            await this.animateBarTo(100);

            // Subtrai custo do nível com segurança decimal
            xpState.current = parseFloat((xpState.current - needed).toFixed(1));
            
            xpState.level++;
            needed = xpState.level * 100;
            window.GlobalApp.saveData();

            document.getElementById('current-level').textContent = xpState.level;

            // REDUÇÃO DE TEMPO DO LEVEL UP (0.5s)
            if (window.SoundManager) window.SoundManager.play('levelup');
            await new Promise(r => setTimeout(r, 500)); // Espera apenas meio segundo

            await alert(`🎉 LEVEL UP! Nível ${xpState.level} alcançado!`);
            await this.animateBarTo(0, 0);

            if (xpState.current > 0) {
                let newPercentage = (xpState.current / needed) * 100;
                if (newPercentage > 100) newPercentage = 100;
                if (window.SoundManager) window.SoundManager.play('xp');
                await this.animateBarTo(newPercentage);
            }
            if (window.ChestManager) await window.ChestManager.openLinkedChest();
        }
        this.updateUI();
    },

    checkLevelDown: async function() {
        const xpState = window.GlobalApp.data.xp;
        while (xpState.current < 0) {
            if (xpState.level === 1) { xpState.current = 0; break; }
            xpState.level--;
            const prevMax = xpState.level * 100;
            // Soma o débito ao total do nível anterior com segurança decimal
            xpState.current = parseFloat((prevMax + xpState.current).toFixed(1));
            window.GlobalApp.saveData();
            await alert(`⚠️ LEVEL DOWN! Nível ${xpState.level}.`);
        }
        this.updateUI();
    },

    updateUITextOnly: function() {
        if (!window.GlobalApp.data) return;
        const xpData = window.GlobalApp.data.xp;
        const needed = xpData.level * 100;
        // O JS exibe decimais automaticamente se existirem (ex: 10.5)
        document.getElementById('xp-text').textContent = `${xpData.current} / ${needed} XP`;
        document.getElementById('current-level').textContent = xpData.level;
    },

    updateUI: function() {
        if (!window.GlobalApp.data) return;
        const xpData = window.GlobalApp.data.xp;
        const needed = xpData.level * 100;
        let pct = (xpData.current / needed) * 100;
        if (pct < 0) pct = 0; if (pct > 100) pct = 100;

        const bar = document.getElementById('xp-bar-fill');
        if (bar) bar.style.width = `${pct}%`;
        this.updateUITextOnly();
    },

    spawnFloatingText: function(amount, mult, base) {
        const el = document.createElement('div');
        el.className = 'xp-float';
        if (mult > 1) {
             const color = mult === 3 ? '#ff5252' : '#ffab00';
             const scale = mult === 3 ? '1.4' : '1.2';
             el.innerHTML = `
                <div style="display:flex; align-items:center; gap:8px;">
                    <span>+${base} XP</span>
                    <span style="color:${color}; font-weight:900; font-size:${scale}em; text-shadow: 0 2px 10px rgba(0,0,0,0.5); animation: pulse 0.5s infinite alternate;">
                        x${mult}
                    </span>
                </div>`;
        } else {
             el.textContent = `+${amount} XP`;
        }
        el.style.left = '50%'; el.style.top = '40%'; el.style.transform = 'translate(-50%, -50%)';
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 1000);
    },

    deleteLog: async function(visualIndex) {
        if (window.SoundManager) window.SoundManager.play('click');

        const visualGroup = this.currentViewCache[visualIndex];
        if (!visualGroup || !visualGroup.rawIndices || visualGroup.rawIndices.length === 0) return;

        const rawIndexToDelete = visualGroup.rawIndices[visualGroup.rawIndices.length - 1];
        const history = window.GlobalApp.data.xp.history;
        const logToDelete = history[rawIndexToDelete];

        if (!logToDelete) return;

        let confirmed = true;

        if (visualGroup.count === 1) {
            confirmed = await confirm(`Remover registro de "${visualGroup.source}"?`);
        } else {
             confirmed = true;
        }

        if (confirmed) {
            const xpState = window.GlobalApp.data.xp;

            // Subtrai com segurança decimal
            xpState.current = parseFloat((xpState.current - logToDelete.amount).toFixed(1));
            xpState.total = parseFloat((xpState.total - logToDelete.amount).toFixed(1));

            history.splice(rawIndexToDelete, 1);

            if (logToDelete.habitId) {
                const habit = window.GlobalApp.data.habits.find(h => h.id === logToDelete.habitId);
                if (habit) {
                    if (habit.currentOfDay > 0) habit.currentOfDay--;
                    if (habit.totalCount && habit.totalCount > 0) habit.totalCount--;

                    if (habit.type !== 'infinite' && habit.currentOfDay < habit.target) {
                        if (habit.completedToday) {
                            habit.completedToday = false;
                            if (habit.streak > 0) habit.streak--;
                        }
                    }
                }
            }

            this.checkLevelChange();
            window.GlobalApp.saveData();
            this.updateUI();
            this.renderLogs();
            if (window.HabitManager) window.HabitManager.render();
        }
    },

    clearLogs: async function() {
        if (window.SoundManager) window.SoundManager.play('click');
        if(await confirm("Limpar histórico completo?")) {
            window.GlobalApp.data.xp.history = [];
            window.GlobalApp.saveData();
            this.renderLogs();
        }
    }
};

window.XPManager.init();

document.addEventListener('DOMContentLoaded', () => {
    const btnClear = document.getElementById('btn-clear-logs');
    if(btnClear) btnClear.addEventListener('click', () => window.XPManager.clearLogs());
});
