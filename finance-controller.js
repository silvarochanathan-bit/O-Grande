/**
 * FINANCE-CONTROLLER.JS
 * Orquestrador do Módulo Financeiro.
 * Gerencia inputs de transações, abates de dívida e celebrações de Tier.
 */

window.FinanceController = {

    // CIRURGIA FASE 3: Mapa atualizado para reconhecer as novas linhas de riqueza do termômetro
    tierLevels: {
        'divida_critica': 1,
        'divida_profunda': 2,
        'divida_media': 3,
        'divida_leve': 4,
        'neutro': 5,
        'reserva': 6,
        'positivo': 7,
        'crescimento': 8,
        'abundancia': 9,
        'liberdade': 10
    },

    init: function() {
        console.log("[FinanceController] Controlador Financeiro Ativado.");
        
        // Espera o DOM e as dependências estarem prontas
        document.addEventListener('SiteC_DataReady', () => {
            if (window.FinanceView) {
                window.FinanceView.init('finance-container');
                this.render();
            }
        });
        
        document.addEventListener('SiteC_NavigationChanged', (e) => {
            if (e.detail.app === 'finance') {
                this.render();
            }
        });
    },

    render: function() {
        if (window.FinanceView) window.FinanceView.render();
    },

    changeFilter: function(daysVal) {
        window.FinanceView.currentFilter = parseInt(daysVal);
        this.render();
    },

    openAddModal: function(type) {
        document.getElementById('fin-modal-type').value = type;
        var title = document.getElementById('fin-modal-title');
        var pendingGroup = document.getElementById('fin-pending-group');
        var form = document.getElementById('form-finance-transaction');
        
        form.reset();

        if (type === 'gain') {
            title.textContent = "Adicionar Ganho";
            title.style.color = "var(--fin-tier-positivo)";
            pendingGroup.style.display = "none";
        } else {
            title.textContent = "Adicionar Gasto";
            title.style.color = "var(--fin-tier-divida-media)";
            pendingGroup.style.display = "block"; 
        }

        window.FinanceView.toggleModal('modal-finance-transaction', true);
    },

    submitTransaction: function() {
        var type = document.getElementById('fin-modal-type').value;
        var amountStr = document.getElementById('fin-input-amount').value.replace(',', '.');
        var amount = parseFloat(amountStr);
        var category = document.getElementById('fin-input-category').value;
        var note = document.getElementById('fin-input-note').value;
        var isPending = document.getElementById('fin-input-pending').checked;

        if (isNaN(amount) || amount <= 0) {
            alert("Digite um valor válido maior que zero.");
            return;
        }

        var oldTier = window.FinanceModel.getTier();

        if (type === 'gain') {
            window.FinanceModel.addGain(amount, category, note);
        } else {
            window.FinanceModel.addExpense(amount, category, isPending, note);
        }

        window.FinanceView.toggleModal('modal-finance-transaction', false);
        
        var newTier = window.FinanceModel.getTier();
        
        // CIRURGIA ÚNICA: Renderiza primeiro e dispara a animação para transações genéricas
        this.render();

        var percentChange = (amount / 4000) * 100;
        setTimeout(function() {
            var badge = document.getElementById('finance-thermometer-badge');
            if (badge) {
                var isGain = type === 'gain';
                badge.innerHTML = (isGain ? "+" : "-") + percentChange.toFixed(1).replace('.', ',') + "%";
                badge.style.background = isGain ? "var(--fin-tier-positivo)" : "var(--fin-tier-divida-media)";
                badge.style.opacity = "1";
                
                setTimeout(function() {
                    badge.style.opacity = "0";
                }, 4000);
            }
        }, 100);

        this.checkTierUpgrade(oldTier, newTier);
    },

    promptPayDebt: async function(debtId, category, maxAmount) {
        var msg = `💰 ABATER PROVISÃO: ${category}\n\nVocê tem R$ ${maxAmount.toFixed(2)} pendentes.\nQuanto você está repondo/pagando agora? (Use ponto ou vírgula)`;
        var result = await prompt(msg, maxAmount.toFixed(2));
        
        if (!result) return;

        var amountPaid = parseFloat(result.replace(',', '.'));
        if (isNaN(amountPaid) || amountPaid <= 0) {
            alert("Valor inválido.");
            return;
        }

        if (amountPaid > maxAmount) {
            alert(`Você não pode abater mais do que deve (Máx: R$ ${maxAmount.toFixed(2)}).`);
            return;
        }

        var success = window.FinanceModel.payPendingDebt(debtId, amountPaid);
        
        if (success) {
            if (amountPaid === maxAmount) {
                await alert(`🎉 PARABÉNS! Provisão de "${category}" totalmente reposta! Menos um peso nas costas.`);
            } else {
                alert(`✅ R$ ${amountPaid.toFixed(2)} abatidos da provisão de "${category}".`);
            }

            this.render();
        }
    },

    checkTierUpgrade: function(oldTier, newTier) {
        var oldVal = this.tierLevels[oldTier.id] || 0;
        var newVal = this.tierLevels[newTier.id] || 0;

        if (newVal > oldVal) {
            setTimeout(function() {
                alert("🌟 EVOLUÇÃO FINANCEIRA!\n\nVocê avançou para o nível: " + newTier.label + "!\n\nContinue administrando seus recursos com sabedoria.");
            }, 1600); // CIRURGIA ÚNICA: Atraso mágico para a animação acabar primeiro
        } else if (newVal < oldVal) {
            if (newTier.id.includes('divida') && !oldTier.id.includes('divida')) {
                setTimeout(function() {
                    alert("⚠️ ATENÇÃO: Você entrou no espectro de dívida (" + newTier.label + ").\n\nHora de segurar os gastos!");
                }, 1600); // CIRURGIA ÚNICA: Atraso mágico para a animação acabar primeiro
            }
        }
    },

    // =========================================
    // NOVAS FUNÇÕES (UBER, EDITAR, DELETAR, PRÉ-PAGO)
    // =========================================

    openPrepaidModal: function() {
        document.getElementById('form-finance-prepaid').reset();
        document.getElementById('fin-prepaid-category').value = "Gasolina"; 
        window.FinanceView.toggleModal('modal-finance-prepaid', true);
    },

    submitPrepaidCredit: function() {
        var amountStr = document.getElementById('fin-prepaid-amount').value.replace(',', '.');
        var amount = parseFloat(amountStr);
        var category = document.getElementById('fin-prepaid-category').value;

        if (isNaN(amount) || amount <= 0) {
            alert("Digite um valor válido maior que zero.");
            return;
        }

        var oldTier = window.FinanceModel.getTier();
        
        window.FinanceModel.addPrepaidCredit(amount, category, "Compra Antecipada (" + category + ")");
        
        window.FinanceView.toggleModal('modal-finance-prepaid', false);
        
        var newTier = window.FinanceModel.getTier();
        this.checkTierUpgrade(oldTier, newTier);
        this.render();
    },

    openUberModal: function() {
        var settings = window.FinanceModel.getUberSettings();
        document.getElementById('uber-km-liter').value = settings.kmPerLiter;
        document.getElementById('uber-fuel-price').value = settings.fuelPrice;
        
        document.getElementById('uber-km-start').value = '';
        document.getElementById('uber-km-end').value = '';
        document.getElementById('uber-gross-revenue').value = '';
        
        document.getElementById('uber-config-area').classList.add('hidden');

        var session = window.FinanceModel.getUberSession();
        if (session.active) {
            document.getElementById('uber-step-1').style.display = 'none';
            document.getElementById('uber-step-2').style.display = 'block';
            document.getElementById('uber-km-start-display').textContent = session.startKm.toFixed(1);
        } else {
            document.getElementById('uber-step-1').style.display = 'block';
            document.getElementById('uber-step-2').style.display = 'none';
        }
        
        window.FinanceView.toggleModal('modal-finance-uber', true);
    },

    startUberSession: function() {
        var startKm = parseFloat(document.getElementById('uber-km-start').value.replace(',', '.'));
        if (isNaN(startKm)) {
            alert("Digite o odômetro inicial válido.");
            return;
        }
        window.FinanceModel.startUberSession(startKm);
        document.getElementById('uber-step-1').style.display = 'none';
        document.getElementById('uber-step-2').style.display = 'block';
        document.getElementById('uber-km-start-display').textContent = startKm.toFixed(1);
    },

    cancelUberSession: function() {
        window.FinanceModel.clearUberSession();
        window.FinanceView.toggleModal('modal-finance-uber', false);
    },

    processUberSession: function() {
        var session = window.FinanceModel.getUberSession();
        if (!session.active) {
            alert("Nenhuma sessão ativa encontrada.");
            return;
        }

        var kmStart = session.startKm;
        var kmEnd = parseFloat(document.getElementById('uber-km-end').value.replace(',', '.'));
        var gross = parseFloat(document.getElementById('uber-gross-revenue').value.replace(',', '.'));
        var kmpl = parseFloat(document.getElementById('uber-km-liter').value.replace(',', '.'));
        var price = parseFloat(document.getElementById('uber-fuel-price').value.replace(',', '.'));

        if (isNaN(kmEnd) || isNaN(gross) || isNaN(kmpl) || isNaN(price)) {
            alert("Preencha todos os campos com números válidos.");
            return;
        }
        if (kmEnd <= kmStart) {
            alert("O Odômetro Final deve ser maior que o Inicial.");
            return;
        }

        var usePrepaid = false;
        var fundingRadios = document.getElementsByName('uber-funding');
        if (fundingRadios) {
            for (var i = 0; i < fundingRadios.length; i++) {
                if (fundingRadios[i].checked && fundingRadios[i].value === 'prepaid') {
                    usePrepaid = true;
                    break;
                }
            }
        }

        window.FinanceModel.saveUberSettings(kmpl, price);
        var distance = kmEnd - kmStart;
        var fuelCost = (distance / kmpl) * price;
        var netProfit = gross - fuelCost;

        var oldTier = window.FinanceModel.getTier();
        
        var efficiency = gross / distance;
        var customNote = "Rodou " + distance.toFixed(1) + "km | Líquido: R$ " + netProfit.toFixed(2).replace('.', ',') + " | Média: R$ " + efficiency.toFixed(2).replace('.', ',') + "/km";
        
        window.FinanceModel.addGain(gross, 'Uber', customNote, netProfit);
        window.FinanceModel.addExpense(fuelCost, 'Gasolina', !usePrepaid, "Provisão Uber (" + distance.toFixed(1) + "km)", usePrepaid);
        window.FinanceModel.clearUberSession();

        window.FinanceView.toggleModal('modal-finance-uber', false);
        
        document.getElementById('celeb-net-profit').textContent = "R$ " + netProfit.toFixed(2).replace('.', ',');
        document.getElementById('celeb-gas-cost').textContent = "R$ " + fuelCost.toFixed(2).replace('.', ',');
        document.getElementById('celeb-distance').textContent = distance.toFixed(1).replace('.', ',') + " km";
        document.getElementById('celeb-efficiency').textContent = "R$ " + efficiency.toFixed(2).replace('.', ',') + " / km";
        
        window.FinanceView.toggleModal('modal-finance-celebration', true);

        // Guarda os dados secretamente e não atualiza o painel ainda
        window.FinanceController._tempOldTier = oldTier;
        window.FinanceController._tempPercentGain = (netProfit / 4000) * 100;
    },

    closeCelebration: function() {
        window.FinanceView.toggleModal('modal-finance-celebration', false);
        
        // O grande momento! Renderiza a tela para acionar a setinha do CSS
        this.render();

        // Checa e dispara mensagens de motivação/alerta
        if (window.FinanceController._tempOldTier) {
            var newTier = window.FinanceModel.getTier();
            this.checkTierUpgrade(window.FinanceController._tempOldTier, newTier);
        }

        // Faz o emblema de porcentagem piscar após a seta começar a andar
        var percentGain = window.FinanceController._tempPercentGain || 0;
        setTimeout(function() {
            var badge = document.getElementById('finance-thermometer-badge');
            if (badge) {
                badge.innerHTML = "+" + percentGain.toFixed(1).replace('.', ',') + "%";
                badge.style.opacity = "1";
                
                // Apaga o emblema sozinho após 4 segundos para manter o visual limpo
                setTimeout(function() {
                    badge.style.opacity = "0";
                }, 4000);
            }
        }, 500); // Aguarda meio segundo

        // Limpa a memória para o próximo check-in
        window.FinanceController._tempOldTier = null;
        window.FinanceController._tempPercentGain = 0;
    },

    deleteTransaction: async function(id) {
        if (confirm("Tem certeza que deseja apagar esta transação? Isso reverterá os seus efeitos.")) {
            var oldTier = window.FinanceModel.getTier();
            var success = window.FinanceModel.deleteTransaction(id);
            if (success) {
                var newTier = window.FinanceModel.getTier();
                this.checkTierUpgrade(oldTier, newTier);
                this.render();
            }
        }
    },

    openEditModal: function(id) {
        var tx = window.GlobalApp.data.finance.transactions.find(function(t) { return t.id === id; });
        if (!tx) return;

        document.getElementById('fin-edit-id').value = tx.id;
        document.getElementById('fin-edit-type').value = tx.type;
        document.getElementById('fin-edit-amount').value = tx.amount;
        document.getElementById('fin-edit-category').value = tx.category;
        document.getElementById('fin-edit-note').value = tx.note || '';

        var pendingGroup = document.getElementById('fin-edit-pending-group');
        var pendingCheck = document.getElementById('fin-edit-pending');

        if (tx.type === 'expense') {
            pendingGroup.style.display = 'block';
            pendingCheck.checked = tx.isPending || false;
        } else {
            pendingGroup.style.display = 'none';
            pendingCheck.checked = false;
        }
        window.FinanceView.toggleModal('modal-finance-edit', true);
    },

    submitEditTransaction: function() {
        var id = document.getElementById('fin-edit-id').value;
        var amountStr = document.getElementById('fin-edit-amount').value.replace(',', '.');
        var amount = parseFloat(amountStr);
        var category = document.getElementById('fin-edit-category').value;
        var note = document.getElementById('fin-edit-note').value;
        var isPending = document.getElementById('fin-edit-pending').checked;

        if (isNaN(amount) || amount <= 0) {
            alert("Digite um valor válido.");
            return;
        }

        var oldTier = window.FinanceModel.getTier();
        var success = window.FinanceModel.editTransaction(id, amount, category, note, isPending);
        if (success) {
            window.FinanceView.toggleModal('modal-finance-edit', false);
            var newTier = window.FinanceModel.getTier();
            this.checkTierUpgrade(oldTier, newTier);
            this.render();
        }
    }
};

window.FinanceController.init();
