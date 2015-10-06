module meshAdminUi {




    function editorPaneDirective() {
        return {
            restrict: 'E',
            templateUrl: 'projects/components/editorPane/editorPane.html',
            controller: 'EditorPaneController',
            controllerAs: 'vm',
            scope: {}
        };
    }

    /**
     * Controller for the content edit/create form.
     *
     * @param {ng.IScope} $scope
     * @param $location
     * @param {ng.ui.IStateService} $state
     * @param editorService
     * @param {ConfirmActionDialog} confirmActionDialog
     * @param {ng.material.MDDialogService} $mdDialog
     * @param contextService
     * @param i18nService
     * @param dataService
     * @param wipService
     * @param notifyService
     * @constructor
     */
    function EditorPaneController($scope, $location, $state, editorService, confirmActionDialog, $mdDialog, contextService, i18nService, dataService, wipService, notifyService) {
        var vm = this,
            currentNodeId,
            wipType = 'contents',
            projectName = contextService.getProject().name;


        function init(nodeUuid) {

            currentNodeId = nodeUuid;
            $location.search('edit', nodeUuid);

            vm.isNew = false;
            vm.contentModified = false;
            vm.availableLangs = i18nService.languages;
            vm.content = [];
            vm.selectedLangs = {};
            vm.selectedLangs[i18nService.getCurrentLang().code] = true; // set the default language
            vm.canDelete = canDelete;
            vm.persist = persist;
            vm.remove = remove;
            vm.close = close;
            vm.isLoaded = false;

            getContentData()
                .then(populateSchema)
                .then(function () {
                    vm.isLoaded = true;
                });
        }

        editorService.registerOnOpenCallback(init);

        $scope.$watch('vm.contentModified', modifiedWatchHandler);
        $scope.$on('$destroy', saveWipMetadata);

        /**
         * Save the changes back to the server.
         * @param {Object} content
         */
        function persist(content) {
            dataService.persistContent(projectName, content)
                .then(function (response) {
                    if (vm.isNew) {
                        notifyService.toast('NEW_CONTENT_CREATED');
                        wipService.closeItem(wipType, content);
                        content = response;
                        wipService.openItem(wipType, content, {
                            projectName: projectName,
                            selectedLangs: vm.selectedLangs
                        });
                        vm.isNew = false;
                        $state.go('projects.explorer.content', {projectName: projectName, uuid: content.uuid});
                    } else {
                        notifyService.toast('SAVED_CHANGES');
                        wipService.setAsUnmodified(wipType, vm.content);
                        vm.contentModified = false;
                    }
                });
        }

        /**
         * Delete the open content, displaying a confirmation dialog first before making the API call.
         * @param content
         */
        function remove(content) {

            showDeleteDialog()
                .then(function () {
                    return dataService.deleteContent(content);
                })
                .then(function () {
                    wipService.closeItem(wipType, content);
                    notifyService.toast('Deleted');
                    $state.go('projects.explorer');
                });
        }

        /**
         * Close the content, displaying a dialog if it has been modified asking
         * whether to keep or discard the changes.
         *
         * @param content
         */
        function close(content) {
            if (wipService.isModified(wipType, content)) {
                showCloseDialog().then(function (response) {
                    if (response === 'save') {
                        dataService.persistContent(projectName, content);
                        notifyService.toast('SAVED_CHANGES');
                    }
                    wipService.closeItem(wipType, content);
                    $state.go('projects.explorer');
                });
            } else {
                wipService.closeItem(wipType, content);
                $state.go('projects.explorer');
            }
        }


        /**
         * Display the close confirmation dialog box. Returns a promise which is resolved
         * to 'save', 'discard', or rejected if user cancels.
         * TODO: figure out a way to decouple this from the wipTabs component without duplicating all the code.
         * @return {ng.IPromise<String>}
         */
        function showCloseDialog() {
            return $mdDialog.show({
                templateUrl: 'common/components/wipTabs/wipTabsCloseDialog.html',
                controller: 'wipTabsDialogController',
                controllerAs: 'vm'
            });
        }

        /**
         * Display a confirmation dialog for the delete action.
         * @returns {angular.IPromise<any>|any|void}
         */
        function showDeleteDialog() {
            return confirmActionDialog.show({
                title: 'Delete Content?',
                message: 'Are you sure you want to delete the selected content?'
            });
        }

        /**
         * When the value of vm.contentModified evaluates to true, set the wip as
         * modified.
         * @param val
         */
        function modifiedWatchHandler(val) {
            if (val === true) {
                wipService.setAsModified(wipType, vm.content);
            }
        }

        function saveWipMetadata() {
            wipService.setMetadata(wipType, vm.content.uuid, 'selectedLangs', vm.selectedLangs);
        }

        function canDelete() {
            if (vm.content) {
                return -1 < vm.content.permissions.indexOf('delete') && !vm.isNew;
            }
        }


        /**
         * Get the content object either from the server if this is being newly opened, or from the
         * wipService if it exists there.
         *
         * @returns {ng.IPromise}
         */
        function getContentData() {
            var schemaId = $location.search().schemaId;

            if (currentNodeId) {
                // loading existing content
                var wipContent = wipService.getItem(wipType, currentNodeId);

                if (wipContent) {
                    return populateFromWip(wipContent);
                } else {
                    return dataService
                        .getContent(projectName, currentNodeId)
                        .then(function (data) {
                            vm.content = data;
                            wipService.openItem(wipType, data, {
                                projectName: projectName,
                                selectedLangs: vm.selectedLangs
                            });
                            return dataService.getSchema(data.schema.uuid);
                        });
                }
            } else if (schemaId) {
                // creating new content
                vm.isNew = true;
                return dataService.getSchema(schemaId)
                    .then(function (schema) {
                        vm.content = createEmptyContent(schema.uuid, schema.title);
                        wipService.openItem(wipType, vm.content, {
                            projectName: projectName,
                            isNew: true,
                            selectedLangs: vm.selectedLangs
                        });
                        return schema;
                    });
            }
        }

        /**
         * Populate the vm based on the content item retrieved from the wipService.
         * @param {Object} wipContent
         * @returns {ng.IPromise}
         */
        function populateFromWip(wipContent) {
            var wipMetadata = wipService.getMetadata(wipType, wipContent.uuid);
            vm.content = wipContent;
            vm.contentModified = wipService.isModified(wipType, vm.content);
            vm.selectedLangs = wipMetadata.selectedLangs;
            return dataService.getSchema(vm.content.schema.uuid);
        }

        /**
         * Create an empty content object which is pre-configured according to the arguments passed.
         *
         * @param {string} schemaId
         * @param {string} schemaName
         * @returns {{tagUuid: *, perms: string[], uuid: *, schema: {schemaUuid: *}, schemaName: *}}
         */
        function createEmptyContent(schemaId, schemaName) {
            return {
                perms: ['read', 'create', 'update', 'delete'],
                uuid: wipService.generateTempId(),
                schema: {
                    schemaUuid: schemaId,
                    schemaName: schemaName
                }
            };
        }

        /**
         * Load the schema data into the vm.
         * @param {Object} data
         */
        function populateSchema(data) {
            vm.schema = data;
        }
    }

    export class EditorService {

        private onOpenCallbacks = [];
        private openNodeId;

        constructor(private $rootScope: ng.IRootScopeService,
                    private $location: ng.ILocationService) {
            /**
             * We need to watch the "edit" query string in order to react to
             * external URL changes, e.g. caused by use of browser back &
             * forward buttons.
             */
            $rootScope.$watch(() => $location.search().edit, newVal => {
                if (newVal && newVal !== this.openNodeId) {
                    open(newVal);
                }
            });
        }

        public open(uuid) {
            this.openNodeId = uuid;
            this.onOpenCallbacks.forEach(function (fn) {
                fn.call(null, uuid);
            });
        }

        public getOpenNodeId() {
            return this.openNodeId;
        }

        public registerOnOpenCallback(callback) {
            this.onOpenCallbacks.push(callback);
        }
    }

    angular.module('meshAdminUi.projects')
        .directive('editorPane', editorPaneDirective)
        .controller('EditorPaneController', EditorPaneController)
        .service('editorService', EditorService);
}