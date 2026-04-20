/**
 * FINANCE-MODEL.JS
 * Motor lógico do módulo de Controle Financeiro.
 * Gerencia ganhos, gastos, fluxo de dívidas/provisão e Tiers de riqueza.
 */

window.FinanceModel = {

    init: function() {
        if (!window.GlobalApp.data.finance) {
            window.GlobalApp.data.finance = {
                transactions: [],
                pendingDebts: []
            };
        }
        // Injeção Odômetro: Configurações do Uber
        if (!window.GlobalApp.data.finance.uberSettings) {
            window.GlobalApp.data.finance.uberSettings = {
                kmPerLiter: 10.0,
                fuelPrice: 5.50
            };
        }
        console.log("[FinanceModel] Cérebro Financeiro Ativado.");
    },

    /**
     * Retorna a Carteira Livre.
     * Matemática: Ganhos totais - Gastos totais (incluindo provisões).
     * O pagamento de dívida (debt_payment) não altera esse saldo, 
     * pois a dedução já ocorreu no momento do gasto original.
     */
    getWalletBalance: function() {
        const txs = window.GlobalApp.data.finance.transactions || [];
        let balance = 0;
        
        txs.forEach(t => {
            if (t.type === 'gain') {
                balance += t.amount;
            } else if (t.type === 'expense') {
                balance -= t.amount;
            }
            // 'debt_payment' é ignorado aqui para não duplicar o desconto
        });
        
        return balance;
    },

    /**
     * Adiciona um Ganho (Ex: Uber, Salário)
     */
    addGain: function(amount, category, note) {
        const tx = {
            id: window.GlobalApp.generateUUID(),
            type: 'gain',
            amount: parseFloat(amount),
            category: category,
            note: note || '',
            date: window.GlobalApp.getGameDate(),
            timestamp: Date.now()
        };
        
        window.GlobalApp.data.finance.transactions.push(tx);
        window.GlobalApp.saveData();
        return tx;
    },

    /**
     * Adiciona um Gasto e opcionalmente cria uma Provisão/Dívida (Ex: Gasolina a repor)
     */
    addExpense: function(amount, category, isPending, note) {
        const parsedAmount = parseFloat(amount);
        
        const tx = {
            id: window.GlobalApp.generateUUID(),
            type: 'expense',
            amount: parsedAmount,
            category: category,
            isPending: isPending,
            note: note || '',
            date: window.GlobalApp.getGameDate(),
            timestamp: Date.now()
        };
        
        window.GlobalApp.data.finance.transactions.push(tx);

        // Se for um gasto que precisa ser "reposto" no futuro (Dívida Acumulada)
        if (isPending) {
            const debts = window.GlobalApp.data.finance.pendingDebts;
            let existingDebt = debts.find(d => d.category === category);
            
            if (existingDebt) {
                existingDebt.amount += parsedAmount;
            } else {
                debts.push({
                    id: window.GlobalApp.generateUUID(),
                    category: category,
                    amount: parsedAmount
                });
            }
        }

        window.GlobalApp.saveData();
        return tx;
    },

    /**
     * Abate/Quita uma Dívida Pendente (Total ou Parcial)
     */
    payPendingDebt: function(debtId, amountPaid) {
        const debts = window.GlobalApp.data.finance.pendingDebts;
        const debt = debts.find(d => d.id === debtId);
        
        if (!debt) return false;

        const parsedAmount = parseFloat(amountPaid);
        if (parsedAmount <= 0) return false;

        // Deduz da gaveta de dívidas
        debt.amount -= parsedAmount;

        // Registra o ato do pagamento no histórico (sem afetar a Carteira Livre)
        const tx = {
            id: window.GlobalApp.generateUUID(),
            type: 'debt_payment',
            amount: parsedAmount,
            category: debt.category,
            note: 'Quitação de dívida/reposição',
            date: window.GlobalApp.getGameDate(),
            timestamp: Date.now()
        };
        window.GlobalApp.data.finance.transactions.push(tx);

        // Se zerou ou ficou negativo (pagou a mais), remove a dívida da lista
        if (debt.amount <= 0.01) {
            const idx = debts.indexOf(debt);
            debts.splice(idx, 1);
        }

        window.GlobalApp.saveData();
        return true;
    },

    getPendingDebts: function() {
        return window.GlobalApp.data.finance.pendingDebts || [];
    },

    /**
     * Filtra o histórico de transações por período (em dias)
     */
    getTransactions: function(filterDays) {
        const txs = window.GlobalApp.data.finance.transactions || [];
        
        // Se null ou 0, retorna tudo
        if (!filterDays) return txs.sort((a, b) => b.timestamp - a.timestamp);

        const now = Date.now();
        const msInDay = 24 * 60 * 60 * 1000;
        
        return txs.filter(t => {
            const diff = (now - t.timestamp) / msInDay;
            return diff <= filterDays;
        }).sort((a, b) => b.timestamp - a.timestamp);
    },

    /**
     * Analisa as transações e retorna um sumário por categoria
     */
    getCategorySummary: function(filterDays) {
        const txs = this.getTransactions(filterDays);
        const summary = { gains: {}, expenses: {} };
        
        txs.forEach(t => {
            if (t.type === 'gain') {
                if (!summary.gains[t.category]) summary.gains[t.category] = 0;
                summary.gains[t.category] += t.amount;
            } else if (t.type === 'expense') {
                if (!summary.expenses[t.category]) summary.expenses[t.category] = 0;
                summary.expenses[t.category] += t.amount;
            }
        });
        
        return summary;
    },

    /**
     * Avalia o Nível Financeiro atual baseado na Carteira Livre
     */
    getTier: function() {
        const balance = this.getWalletBalance();
        
        // Espectro Negativo (Dívida)
        if (balance <= -1000) return { id: 'divida_profunda', label: 'Dívida Profunda', color: 'var(--fin-tier-divida-profunda)', isPositive: false };
        if (balance <= -300) return { id: 'divida_media', label: 'Dívida Média', color: 'var(--fin-tier-divida-media)', isPositive: false };
        if (balance < 0) return { id: 'divida_leve', label: 'Levemente no Vermelho', color: 'var(--fin-tier-divida-leve)', isPositive: false };
        
        // Ponto de Equilíbrio
        if (balance === 0) return { id: 'neutro', label: 'Marco Zero', color: 'var(--fin-tier-neutro)', isPositive: true };
        
        // Espectro Positivo (Saúde Financeira)
        if (balance <= 500) return { id: 'reserva', label: 'Reserva Inicial', color: 'var(--fin-tier-reserva)', isPositive: true };
        if (balance <= 2000) return { id: 'positivo', label: 'Fluxo Positivo', color: 'var(--fin-tier-positivo)', isPositive: true };
        
        return { id: 'abundancia', label: 'Abundância', color: 'var(--fin-tier-abundancia)', isPositive: true };
    },

    // =========================================
    // ODÔMETRO UBER E EDIÇÃO DE TRANSAÇÕES
    // =========================================

    getUberSettings: function() {
        return window.GlobalApp.data.finance.uberSettings;
    },

    saveUberSettings: function(kmpl, price) {
        window.GlobalApp.data.finance.uberSettings.kmPerLiter = parseFloat(kmpl) || 10.0;
        window.GlobalApp.data.finance.uberSettings.fuelPrice = parseFloat(price) || 5.50;
        window.GlobalApp.saveData();
    },

    deleteTransaction: function(id) {
        const txs = window.GlobalApp.data.finance.transactions;
        const idx = txs.findIndex(t => t.id === id);
        if (idx === -1) return false;

        const tx = txs[idx];
        const debts = window.GlobalApp.data.finance.pendingDebts;

        // Reverte efeitos de dívidas pendentes
        if (tx.type === 'expense' && tx.isPending) {
            let debt = debts.find(d => d.category === tx.category);
            if (debt) {
                debt.amount -= tx.amount;
                if (debt.amount <= 0.01) {
                    debts.splice(debts.indexOf(debt), 1);
                }
            }
        } else if (tx.type === 'debt_payment') {
            // Se apaguei um pagamento de dívida, a dívida volta a existir
            let debt = debts.find(d => d.category === tx.category);
            if (debt) {
                debt.amount += tx.amount;
            } else {
                debts.push({
                    id: window.GlobalApp.generateUUID(),
                    category: tx.category,
                    amount: tx.amount
                });
            }
        }

        // Remove a transação do banco
        txs.splice(idx, 1);
        window.GlobalApp.saveData();
        return true;
    },

    editTransaction: function(id, newAmount, newCategory, newNote, newIsPending) {
        const txs = window.GlobalApp.data.finance.transactions;
        const tx = txs.find(t => t.id === id);
        if (!tx) return false;

        const debts = window.GlobalApp.data.finance.pendingDebts;

        // 1. Reverter o efeito da transação original (Matemática Reversa)
        if (tx.type === 'expense' && tx.isPending) {
            let debt = debts.find(d => d.category === tx.category);
            if (debt) {
                debt.amount -= tx.amount;
                if (debt.amount <= 0.01) debts.splice(debts.indexOf(debt), 1);
            }
        } else if (tx.type === 'debt_payment') {
            let debt = debts.find(d => d.category === tx.category);
            if (debt) debt.amount += tx.amount;
            else debts.push({ id: window.GlobalApp.generateUUID(), category: tx.category, amount: tx.amount });
        }

        // 2. Atualizar os dados para a nova configuração
        const parsedAmount = parseFloat(newAmount);
        tx.amount = parsedAmount;
        tx.category = newCategory;
        tx.note = newNote || '';
        
        // 3. Re-aplicar o efeito na provisão com os valores novos
        if (tx.type === 'expense') {
            tx.isPending = newIsPending;
            if (tx.isPending) {
                let debt = debts.find(d => d.category === tx.category);
                if (debt) debt.amount += parsedAmount;
                else debts.push({ id: window.GlobalApp.generateUUID(), category: tx.category, amount: parsedAmount });
            }
        } else if (tx.type === 'debt_payment') {
            tx.category = newCategory; 
            let debt = debts.find(d => d.category === tx.category);
            if (debt) {
                debt.amount -= parsedAmount;
                if (debt.amount <= 0.01) debts.splice(debts.indexOf(debt), 1);
            }
        }

        window.GlobalApp.saveData();
        return true;
    }
};

window.FinanceModel.init();