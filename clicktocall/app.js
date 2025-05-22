define(function (require) {
    var monster = require('monster'),
        $ = require('jquery'),
        _ = require('lodash');

    var kazooSdk = $.getKazooSdk({
        apiRoot: monster.config.api.default,
        authToken: monster.apps.auth.authToken || monster.apps.auth.getAuthToken(),
        uiMetadata: {
            ui: 'clicktocall',
            version: '1.0'
        },
        onRequestError: function (error, requestOptions) {
            if (requestOptions.generateError !== false) {
                var parsedError = JSON.parse(error.responseText);
                monster.ui.alert('error', parsedError.message);
            }
        }
    });

    var dialog;


    var app = {
        name: 'click2call',

        i18n: {
            'en-US': { customCss: false }
        },

        requests: {
            'click2call.list': {
                apiRoot: monster.config.api.default,
                url: 'accounts/{accountId}/clicktocall?fields=["name","extension", "id", "auth_required"]',
                verb: 'GET'
            },
            'click2call.get': {
                apiRoot: monster.config.api.default,
                url: 'accounts/{accountId}/clicktocall/{c2cId}',
                verb: 'GET'
            },
            'click2call.create': {
                apiRoot: monster.config.api.default,
                url: 'accounts/{accountId}/clicktocall',
                verb: 'PUT'
            },
            'click2call.update': {
                apiRoot: monster.config.api.default,
                url: 'accounts/{accountId}/clicktocall/{c2cId}',
                verb: 'POST'
            },
            'click2call.delete': {
                apiRoot: monster.config.api.default,
                url: 'accounts/{accountId}/clicktocall/{c2cId}',
                verb: 'DELETE'
            },
            'external_number.list': {
                apiRoot: monster.config.api.default,
                url: 'accounts/{accountId}/external_numbers',
                verb: 'GET'
            }
        },

        subscribe: {},

        load: function (callback) {
            var self = this;

            self.initAuth(function () {
                callback && callback(self);
            });
        },

        initApp: function (callback) {
            var self = this;

            monster.pub('auth.initApp', {
                app: self,
                callback: callback
            });
        },

        render: function (container) {
            var self = this,
                $container = _.isEmpty(container) ? $('#monster_content') : container,
                $layout = $(self.getTemplate({ name: 'layout' }));

            self.listClick2Calls(function (list) {
                var $table = self.renderList(list);
                $layout.find('.table-container').append($table);

                self.bindEvents({ template: $layout });

                $container
                    .empty()
                    .append($layout);
            });
        },

        listClick2Calls: function (callback) {
            var self = this;

            monster.request({
                resource: 'click2call.list',
                data: { accountId: self.accountId },
                success: function (data) {
                    callback(data.data);
                },
                error: function () {
                    callback([]);
                }
            });
        },

        renderList: function (list) {
            var self = this;
            var $c2clist = $(self.getTemplate({
                name: 'list',
                data: { items: list, accountId: self.accountId, authToken: self.authToken }
            }));
            monster.ui.tooltips($c2clist);
            return $c2clist;
        },

        bindEvents: function (args) {
            var self = this,
                $template = args.template;

            $template.on('click', '#add-new', function () {

                monster.parallel({
                    numbers: function (callback) {
                        kazooSdk.numbers.list({
                            accountId: self.accountId,
                            success: function (data) {
                                callback(null, data)
                            }
                        })
                    },
                    external_numbers: function (callback) {
                        monster.request({
                            resource: 'external_number.list',
                            data: {
                                accountId: self.accountId
                            },
                            success: function (data) {
                                callback(null, data)
                            }
                        })
                    }
                }, function (err, results) {
                    var allNumbers = Object.keys(results.numbers.data.numbers);
                    results.external_numbers.data.forEach(nmbr => {
                        allNumbers.push(nmbr.number)
                    });
                    var $form = $(self.getTemplate({
                        name: 'form',
                        data: {
                            numbers: allNumbers,
                            button: 'Create'
                        }
                    }));
                    monster.ui.tooltips($form);

                    monster.ui.dialog($form, {
                        title: 'New Click to Call',
                        width: '670px'
                    });
                    $form.find('select[name="dial_first"]').on('change', function () {
                        var value = $(this).val();

                        if (value === 'contact') {
                            $form.find('#caller-id-options').slideDown(50);
                        } else {
                            $form.find('input[name="outbound_callee_id_name"]').val('');
                            $form.find('select[name="outbound_callee_id_number"]').val('');
                            $form.find('#caller-id-options').slideUp(50);
                        }
                    });
                    $form.find('select[name="dial_first"]').trigger('change');
                    $form.on('click', '#cancel', function () {
                        $(".ui-dialog-titlebar-close").trigger("click");
                    });
                    $form.on('click', '#save', function () {
                        var rawData = $('#form_rule').serializeArray();
                        var formValues = {};
                        _.each(rawData, function (field) {
                            formValues[field.name] = field.value;
                        });
                        formValues.caller_id_name = formValues.outbound_callee_id_name;
                        formValues.callee_id_name = formValues.outbound_callee_id_name;
                        formValues.caller_id_number = formValues.outbound_callee_id_number;
                        formValues.callee_id_number = formValues.outbound_callee_id_number
                        formValues.auth_required = $('#form_rule .switch-state').is(':checked');
                        var cleanedObject = _.pickBy(formValues, function (value) {
                            return value !== undefined && value !== null && value !== '';
                        });
                        monster.request({
                            resource: 'click2call.create',
                            data: {
                                accountId: self.accountId,
                                data: cleanedObject
                            },
                            success: function (data) {
                                $(".ui-dialog-titlebar-close").trigger("click");
                                self.render();
                                monster.ui.toast({ type: 'success', message: 'Click to Call ' + data.data.name + ' Created' });
                            }
                        })

                    });
                }
                )


            });

            $template.on('click', '.edit-button', function () {
                var id = $(this).data('id');

                monster.parallel({
                    clicktocall: function (callback) {
                        monster.request({
                            resource: 'click2call.get',
                            data: {
                                accountId: self.accountId,
                                c2cId: id
                            },
                            success: function (data) {
                                callback(null, data)
                            }
                        })
                    },
                    numbers: function (callback) {
                        kazooSdk.numbers.list({
                            accountId: self.accountId,
                            success: function (data) {
                                callback(null, data)
                            }
                        })
                    },
                    external_numbers: function (callback) {
                        monster.request({
                            resource: 'external_number.list',
                            data: {
                                accountId: self.accountId
                            },
                            success: function (data) {
                                callback(null, data)
                            }
                        })
                    }
                }, function (err, results) {
                    var allNumbers = Object.keys(results.numbers.data.numbers);
                    results.external_numbers.data.forEach(nmbr => {
                        allNumbers.push(nmbr.number)
                    });
                    var $form = $(self.getTemplate({
                        name: 'form',
                        data: {
                            c2c: results.clicktocall.data,
                            numbers: allNumbers,
                            button: 'Save Changes'
                        }
                    }));

                    monster.ui.tooltips($form);

                    monster.ui.dialog($form, {
                        title: 'Edit ' + results.clicktocall.data.name,
                        width: '670px'
                    });
                    $form.find('select[name="dial_first"]').on('change', function () {
                        var value = $(this).val();

                        if (value === 'contact') {
                            $form.find('#caller-id-options').slideDown(50);
                        } else {
                            $form.find('input[name="outbound_callee_id_name"]').val('');
                            $form.find('select[name="outbound_callee_id_number"]').val('');
                            $form.find('#caller-id-options').slideUp(50);
                        }
                    });
                    $form.find('select[name="dial_first"]').trigger('change');
                    $form.on('click', '#cancel', function () {
                        $(".ui-dialog-titlebar-close").trigger("click");
                    });
                    $form.on('click', '#save', function () {
                        var rawData = $('#form_rule').serializeArray();
                        var formValues = {};
                        _.each(rawData, function (field) {
                            formValues[field.name] = field.value;
                        });
                        formValues.caller_id_name = formValues.outbound_callee_id_name;
                        formValues.callee_id_name = formValues.outbound_callee_id_name;
                        formValues.caller_id_number = formValues.outbound_callee_id_number;
                        formValues.callee_id_number = formValues.outbound_callee_id_number
                        formValues.auth_required = $('#form_rule .switch-state').is(':checked');
                        var cleanedObject = _.pickBy(formValues, function (value) {
                            return value !== undefined && value !== null && value !== '';
                        });
                        monster.request({
                            resource: 'click2call.update',
                            data: {
                                accountId: self.accountId,
                                c2cId: id,
                                data: cleanedObject
                            },
                            success: function (data) {
                                $(".ui-dialog-titlebar-close").trigger("click");
                                self.render();
                                monster.ui.toast({ type: 'success', message: 'Click to Call ' + data.data.name + ' Updated' });
                            }
                        })

                    });
                })
            });

            $template.on('click', '.copy-url', function () {
                var c2cId = $(this).data('id');
                var url = monster.config.api.default + 'accounts/' + self.accountId + '/clicktocall/' + c2cId + '/connect?contact={number}';
                if ($(this).data('auth')) {
                    url += '?auth_token={auth token}'
                }
                navigator.clipboard.writeText(url);
                monster.ui.toast({ type: 'success', message: 'URL copied to clipboard' });
            });

            $template.on('click', '.drop-rule', function () {
                var c2cId = $(this).data('id');
                monster.ui.confirm('Are you sure you want to delete the rule from your account?', function () {
                    monster.request({
                        resource: 'click2call.delete',
                        data: {
                            accountId: self.accountId,
                            c2cId
                        },
                        success: function () {
                            self.render();
                            monster.ui.toast({ type: 'error', message: 'Click to Call Deleted' });
                        }
                    });
                });

            })


        }
    };

    return app;
});
