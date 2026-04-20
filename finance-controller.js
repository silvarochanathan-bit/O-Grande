/**
 * FINANCE-CONTROLLER.JS
 * Orquestrador do Módulo Financeiro.
 * Gerencia inputs de transações, abates de dívida e celebrações de Tier.
 */

window.FinanceController = {

    // Mapa de valores para comparar subidas e descidas de nível
    tierLevels: {
        'divida_profunda': 1,
        'divida_media': 2,
        'divida_leve': 3,
        'neutro': 4,
        'reserva': 5,
        'positivo': 6,
        'abundancia': 7
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
        if (window.SoundManager) window.SoundManager.play('click');
        window.FinanceView.currentFilter = parseInt(daysVal);
        this.render();
    },

    openAddModal: function(type) {
        if (window.SoundManager) window.SoundManager.play('click');
        
        document.getElementById('fin-modal-type').value = type;
        var title = document.getElementById('fin-modal-title');
        var pendingGroup = document.getElementById('fin-pending-group');
        var form = document.getElementById('form-finance-transaction');
        
        form.reset();

        // Customiza o modal dependendo de qual botão foi clicado
        if (type === 'gain') {
            title.textContent = "Adicionar Ganho";
            title.style.color = "var(--fin-tier-positivo)";
            pendingGroup.style.display = "none";
        } else {
            title.textContent = "Adicionar Gasto";
            title.style.color = "var(--fin-tier-divida-media)";
            pendingGroup.style.display = "block"; // Libera a opção de jogar pra dívida
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

        // Guarda o nível atual ANTES da transação para podermos comparar depois
        var oldTier = window.FinanceModel.getTier();

        if (type === 'gain') {
            window.FinanceModel.addGain(amount, category, note);
        } else {
            window.FinanceModel.addExpense(amount, category, isPending, note);
        }

        window.FinanceView.toggleModal('modal-finance-transaction', false);
        
        // Verifica se houve mudança de nível
        var newTier = window.FinanceModel.getTier();
        this.checkTierUpgrade(oldTier, newTier);

        if (window.SoundManager && oldTier.id === newTier.id) {
            window.SoundManager.play('coin'); // Som normal de transação se não subiu de nível
        }

        this.render();
    },

    promptPayDebt: async function(debtId, category, maxAmount) {
        if (window.SoundManager) window.SoundManager.play('click');
        
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
            // Abater dívida não muda o Tier (pois o dinheiro já foi deduzido da carteira na hora do gasto),
            // Mas dá a sensação emocional de peso aliviado!
            if (amountPaid === maxAmount) {
                if (window.SoundManager) window.SoundManager.play('levelup');
                await alert(`🎉 PARABÉNS! Provisão de "${category}" totalmente reposta! Menos um peso nas costas.`);
            } else {
                if (window.SoundManager) window.SoundManager.play('coin');
                alert(`✅ R$ ${amountPaid.toFixed(2)} abatidos da provisão de "${category}".`);
            }

            this.render();
        }
    },

    checkTierUpgrade: function(oldTier, newTier) {
        var oldVal = this.tierLevels[oldTier.id] || 0;
        var newVal = this.tierLevels[newTier.id] || 0;

        if (newVal > oldVal) {
            // EVOLUÇÃO (Subiu rumo ao positivo)
            if (window.SoundManager) window.SoundManager.play('chest');
            
            setTimeout(function() {
                alert(`🌟 EVOLUÇÃO FINANCEIRA!\n\nVocê avançou para o nível: ${newTier.label}!\n\nContinue administrando seus recursos com sabedoria. O controle é o primeiro passo para a liberdade absoluta.`);
            }, 500);
            
        } else if (newVal < oldVal) {
            // REGRESSÃO
            if (newTier.id.includes('divida') && !oldTier.id.includes('divida')) {
                // Caiu de uma fase neutra/positiva para o vermelho
                setTimeout(function() {
                    alert(`⚠️ ATENÇÃO: Você entrou no espectro de dívida (${newTier.label}).\n\nHora de segurar os gastos e focar em repor a carteira!`);
                }, 500);
            }
        }
    },

    // =========================================
    // NOVAS FUNÇÕES (UBER, EDITAR, DELETAR) - SEM SOUNDMANAGER
    // =========================================

    openUberModal: function() {
        var settings = window.FinanceModel.getUberSettings();
        document.getElementById('uber-km-liter').value = settings.kmPerLiter;
        document.getElementById('uber-fuel-price').value = settings.fuelPrice;
        
        document.getElementById('uber-km-start').value = '';
        document.getElementById('uber-km-end').value = '';
        document.getElementById('uber-gross-revenue').value = '';
        
        document.getElementById('uber-config-area').classList.add('hidden');

        window.FinanceView.toggleModal('modal-finance-uber', true);
    },

    processUberSession: function() {
        var kmStart = parseFloat(document.getElementById('uber-km-start').value.replace(',', '.'));
        var kmEnd = parseFloat(document.getElementById('uber-km-end').value.replace(',', '.'));
        var gross = parseFloat(document.getElementById('uber-gross-revenue').value.replace(',', '.'));
        var kmpl = parseFloat(document.getElementById('uber-km-liter').value.replace(',', '.'));
        var price = parseFloat(document.getElementById('uber-fuel-price').value.replace(',', '.'));

        if (isNaN(kmStart) || isNaN(kmEnd) || isNaN(gross) || isNaN(kmpl) || isNaN(price)) {
            alert("Preencha todos os campos com números válidos.");
            return;
        }

        if (kmEnd <= kmStart) {
            alert("O Odômetro Final deve ser maior que o Inicial.");
            return;
        }

        // Salva configurações para a próxima
        window.FinanceModel.saveUberSettings(kmpl, price);

        var distance = kmEnd - kmStart;
        var fuelCost = (distance / kmpl) * price;
        var netProfit = gross - fuelCost;

        var oldTier = window.FinanceModel.getTier();

        // 1. Registra o Ganho (Lucro Líquido)
        window.FinanceModel.addGain(netProfit, 'Uber', `Lucro Líquido (Rodou ${distance.toFixed(1)}km)`);
        
        // 2. Registra o Gasto da Gasolina já como Provisão (A Repor)
        window.FinanceModel.addExpense(fuelCost, 'Gasolina', true, `Provisão Uber (${distance.toFixed(1)}km)`);

        window.FinanceView.toggleModal('modal-finance-uber', false);

        var newTier = window.FinanceModel.getTier();
        this.checkTierUpgrade(oldTier, newTier);

        this.render();
    },

    deleteTransaction: async function(id) {
        if (await confirm("Tem certeza que deseja apagar esta transação? Isso reverterá seus efeitos na carteira e nas provisões.")) {
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
            alert("Digite um valor válido maior que zero.");
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

window.FinanceController.init()};