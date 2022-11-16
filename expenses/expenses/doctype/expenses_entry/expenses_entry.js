/*
*  ERPNext Expenses © 2022
*  Author:  Ameen Ahmed
*  Company: Level Up Marketing & Software Development Services
*  Licence: Please refer to LICENSE file
*/


frappe.ui.form.on('Expenses Entry', {
    setup: function(frm) {
        E.frm(frm);
        frm.E = {
            base_currency: frappe.boot.sysdefaults.currency,
            mops: {},
            del_files: [],
        };
        
        frm.E.update_exchange_rate = function(cdt, cdn) {
            let c = cdt && cdn
                ? locals[cdt][cdn].account_currency
                : frm.doc.payment_currency;
            if (!c || !frm.E.base_currency) return;
            E.get_exchange_rate(c, frm.E.base_currency, function(v) {
                if (cdt && cdn) {
                    if (v <= flt(locals[cdt][cdn].exchange_rate)) return;
                    locals[cdt][cdn].exchange_rate = v;
                    E.refresh_row_df('expenses', cdn, 'exchange_rate');
                } else {
                    if (v > flt(frm.doc.exchange_rate))
                        frm.set_value('exchange_rate', v);
                }
            });
        };
        frm.E.update_exchange_rates = function() {
            if (!frm.E.base_currency || !frm.doc.payment_currency) return;
            var cc = frm.E.base_currency,
            tasks = [];
            E.each(frm.doc.expenses, function(r) {
                tasks.push(E.get_exchange_rate(r.account_currency, cc, function(v) {
                    if (v > flt(r.exchange_rate)) r.exchange_rate = v;
                }));
            });
            Promise.all(tasks).finally(function() {
                E.clear(tasks);
                E.get_exchange_rate(frm.doc.payment_currency, cc, function(v) {
                    if (v > flt(frm.doc.exchange_rate))
                        frm.set_value('exchange_rate', v);
                    else E.refresh_df('expenses');
                });
            });
        };
        frm.E.update_totals = function() {
            var total = 0;
            E.each(frm.doc.expenses, function(r) {
                r.cost = flt(flt(r.cost_in_account_currency) * flt(r.exchange_rate));
                total += flt(r.cost);
            });
            frm.set_value('total_in_payment_currency',
                flt(total / flt(frm.doc.exchange_rate)));
            frm.set_value('total', total);
            E.refresh_df('expenses');
        };
    },
    onload: function(frm) {
        frm.add_fetch('mode_of_payment', 'type', 'payment_target', frm.doctype);
        
        if (cint(frm.doc.docstatus) > 0) {
            frm.disable_form();
            frm.set_intro(__('Expenses Entry has been submitted'), 'green');
            return;
        }
        
        if (frm.is_new()) {
            var request = E.pop_cache('make-expenses-entry');
            if (request && E.is_str(request)) {
                frm.set_value('expenses_request_ref', request);
                E.call(
                    'get_request_data',
                    {name: request},
                    function(ret) {
                        if (!E.is_obj(ret)) {
                            E.error('Unable to get the expenses request data of {0}', [request]);
                            return;
                        }
                        frm.set_value('company', ret.company);
                        frm.set_value('remarks', ret.remarks);
                        var keys = 'description paid_by expense_claim party_type party project'.split(' ');
                        E.each(ret.expenses, function(v) {
                            let row = frm.add_child('expenses');
                            E.each(keys, function(k) { row[k] = v[k]; });
                            row.expense_ref = v.name;
                            row.account = v.expense_account;
                            row.account_currency = v.currency;
                            row.cost_in_account_currency = flt(v.total);
                            row.is_paid = cint(v.is_paid);
                            row.is_advance = cint(v.is_advance);
                            if (E.is_arr(v.attachments) && v.attachments.length) {
                                E.each(v.attachments, function(a) {
                                    a.expenses_entry_row_ref = row.name;
                                    frm.add_child('attachments', a);
                                });
                            }
                        });
                        E.dfs_property(
                            ['company', 'remarks', 'expenses', 'attachments'],
                            'read_only', 1
                        );
                        E.dfs_properties(['expenses', 'attachments'], {
                            cannot_delete_rows: 1,
                            allow_bulk_edit: 0,
                        });
                        frm.get_field('expenses').grid.df.cannot_delete_rows = 1;
                        frm.get_field('attachments').grid.df.cannot_delete_rows = 1;
                        E.refresh_df('company', 'remarks', 'expenses', 'attachments');
                        frm.E.update_exchange_rates();
                    }
                );
            }
            request = null;
        }
        
        frm.set_query('company', {filters: {is_group: 0}});
        frm.set_query('mode_of_payment', {filters: {type: ['in', ['Cash', 'Bank']]}});
        E.each(['default_project', 'project'], function(k, i) {
            let fn = function() { return {company: frm.doc.company}; };
            frm.set_query(k, i > 0 ? 'expenses' : fn, i > 0 ? fn : null);
        });
        E.each(['default_cost_center', 'cost_center'], function(k, i) {
            let fn = function() { return {company: frm.doc.company}; };
            frm.set_query(k, i > 0 ? 'expenses' : fn, i > 0 ? fn : null);
        });
        
        E.call('with_expense_claim', function(ret) {
            if (!!ret) {
                frm.E.with_expense_claim = true;
                E.df_properties('expense_claim', {options: 'Expense Claim', hidden: 0,}, 'expenses');
                frm.set_query('expense_claim', 'expenses', function(frm, cdt, cdn) {
                    let row = locals[cdt][cdn];
                    return {
                        filters: {
                            employee: row.paid_by,
                            company: frm.doc.company,
                            is_paid: 1,
                            status: 'Paid',
                            docstatus: 1,
                        }
                    };
                });
            }
        });
        
        frm.get_field('expenses').grid.add_custom_button(
            __('Update Exchange Rates'),
            function() {
                let fields = [],
                exist = [];
                E.each(frm.doc.expenses, function(v) {
                    if (exist.indexOf(v.account_currency) >= 0) return;
                    fields.push({
                        fieldname: v.account_currency + '_ex',
                        fieldtype: 'Float',
                        label: frappe.scrub(v.account_currency).toLowerCase(),
                        precision: '9',
                        reqd: 1,
                        bold: 1,
                        value: v.exchange_rate,
                    });
                });
                frappe.prompt(
                    fields,
                    function(ret) {
                        if (!ret || !E.is_cls(ret)) return;
                        E.each(frm.doc.expenses, function(v) {
                            let k = frappe.scrub(v.account_currency).toLowerCase();
                            if (!ret[k]) return;
                            v.exchange_rate = flt(ret[k]);
                            E.refresh_row_df('expenses', v.name, 'exchange_rate');
                        });
                    },
                    __('Update Exchange Rates'),
                    __('Save')
                );
            },
            'bottom'
        );
    },
    refresh: function(frm) {
        frm.E.update_totals();
    },
    company: function(frm) {
        if (!frm.doc.company) frm.set_value('mode_of_payment', '');
    },
    mode_of_payment: function(frm) {
        var mop = frm.doc.mode_of_payment;
        if (!mop) {
            frm.set_value('payment_account', '');
            frm.set_value('payment_target', '');
            frm.set_value('payment_currency', frm.E.base_currency);
            return;
        }
        function resolve(ret) {
            frm.E.base_currency = ret.company_currency;
            frm.set_value('payment_account', ret.account);
            frm.set_value('payment_target', ret.type);
            frm.set_value('payment_currency', ret.currency);
            frm.E.update_exchange_rate();
        }
        if (frm.E.mops[mop]) {
            resolve(frm.E.mops[mop]);
            return;
        }
        E.call(
            'get_mode_of_payment_data',
            {
                mode_of_payment: mop,
                company: frm.doc.company,
            },
            function(ret) {
                if (!ret || !E.is_obj(ret)) {
                    E.error(
                        'Unable to get the mode of payment data of {0} for {1}',
                        [mop, frm.doc.company]
                    );
                    return;
                }
                frm.E.mops[mop] = ret;
                resolve(ret);
            }
        );
    },
    exchange_rate: function(frm) {
        if (flt(frm.doc.exchange_rate) <= 0) frm.E.update_exchange_rate();
        else frm.E.update_totals();
    },
    after_save: function(frm) {
        if (!cint(frm.doc.docstatus) && frm.E.del_files.length) {
            E.call(
                'delete_attach_files',
                {
                    doctype: frm.doctype,
                    name: frm.doc.name || frm.docname,
                    files: frm.E.del_files,
                },
                function() { E.clear(frm.E.del_files); }
            );
        }
    },
});

frappe.ui.form.on('Expenses Entry Details', {
    account: function(frm, cdt, cdn) {
        if (locals[cdt][cdn].account)
            frm.E.update_exchange_rate(cdt, cdn);
    },
    exchange_rate: function(frm, cdt, cdn) {
        let row = locals[cdt][cdn];
        if (flt(row.exchange_rate) <= 0) frm.E.update_exchange_rate(cdt, cdn);
        else frm.E.update_totals();
    },
    is_paid: function(frm, cdt, cdn) {
        let row = locals[cdt][cdn];
        if (!cint(row.is_paid)) {
            row.paid_by = '';
            row.expense_claim = '';
            E.refresh_row_df('expenses', cdn, 'paid_by', 'expense_claim');
        }
    },
    paid_by: function(frm, cdt, cdn) {
        let row = locals[cdt][cdn];
        if (!row.paid_by) {
            row.expense_claim = '';
            E.refresh_row_df('expenses', cdn, 'expense_claim');
        }
    },
    party_type: function(frm, cdt, cdn) {
        let row = locals[cdt][cdn];
        if (!row.party_type) {
            row.party = '';
            E.refresh_row_df('expenses', cdn, 'party');
        }
    },
});

frappe.ui.form.on('Expense Attachment', {
    before_attachments_remove: function(frm, cdt, cdn) {
        let row = locals[cdt][cdn];
        if (row.expenses_entry_row_ref)
            E.error('Removing attachments is not allowed', true);
        if (row.file && !E.has(frm.E.del_files, row.file))
            frm.E.del_files.push(row.file);
    },
    file: function(frm, cdt, cdn) {
        let row = locals[cdt][cdn];
        if (row.file) {
            let idx = frm.E.del_files.indexOf(row.file);
            if (idx >= 0) frm.E.del_files.splice(idx, 1);
        }
    },
});