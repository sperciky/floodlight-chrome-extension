
import { Snapshot, SnapshotCollection } from '/shared/classes/snapshot.class.js';
import { 
    getTemplate, 
    initDatalayerAccordion, 
    getStorageLocalSizeForKey,
    updateStorageProgress
} from '/utils/utils.js';


let currentView = 'snapshots';
let snapshotCollection; 
let selectedHostnames = [];
let selectedDatalayers = [];
let snapshotsViews = [];
let table;

document.addEventListener('DOMContentLoaded', async function() {
    
    await Measure.trackEvent('workspace_snapshots', {}, true);

    
    $(document).on('click', function(e) {
        
        if ($(e.target).closest('.multiselect').length) {
            return;
        }
        
        $('.multiselect').removeClass('is-active');
    });

    
    $(document).on('click', '.multiselect-dropdown', function(e) {
        e.stopPropagation();
    });

    
    function initializeMultiselect(selector) {
        const $multiselect = $(selector);
        const $selected = $multiselect.find('.multiselect-selected');
        const $search = $multiselect.find('.multiselect-search input');
        const $options = $multiselect.find('.multiselect-options');

        
        $selected.on('click', function(e) {
            e.stopPropagation();
            
            $('.multiselect').not($multiselect).removeClass('is-active');
            $multiselect.toggleClass('is-active');
        });

        
        $search.on('input', function() {
            const searchValue = $(this).val().toLowerCase();
            $options.find('.multiselect-option').each(function() {
                const text = $(this).text().toLowerCase();
                $(this).toggle(text.includes(searchValue));
            });
        });

        
        $options.find('input[type="checkbox"]').on('change', function() {
            const value = $(this).val();
            const isChecked = $(this).prop('checked');
            
            if (selector.includes('hostname')) {
                if (isChecked) {
                    selectedHostnames.push(value);
                } else {
                    selectedHostnames = selectedHostnames.filter(h => h !== value);
                }
            } else if (selector.includes('datalayer')) {
                if (isChecked) {
                    selectedDatalayers.push(value);
                } else {
                    selectedDatalayers = selectedDatalayers.filter(d => d !== value);
                }
            }

            updateSelectedDisplay($multiselect);
            applyFilters();
        });
    }

    
    function updateSelectedDisplay($multiselect) {
        const $selected = $multiselect.find('.multiselect-selected');
        const $placeholder = $selected.find('.placeholder');
        const values = $multiselect.hasClass('js-filter-hostname') ? selectedHostnames : selectedDatalayers;

        $selected.find('.tag').remove();
        
        if (values.length === 0) {
            $placeholder.show();
        } else {
            $placeholder.hide();
            values.forEach(value => {
                const $tag = $('<span class="tag">' + value + '<button class="delete is-small"></button></span>');
                $tag.find('.delete').on('click', function(e) {
                    e.stopPropagation();
                    const $checkbox = $multiselect.find(`input[value="${value}"]`);
                    $checkbox.prop('checked', false).trigger('change');
                });
                $selected.append($tag);
            });
        }
    }

    
    async function openPanel(title, content, mainButton = null) {
        const panelData = {
            title: title,
            content: content,
            mainbutton: mainButton
        };
        
        
        let overlay = document.querySelector('.panel-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'panel-overlay';
            document.body.appendChild(overlay);
        }
        
        
        const panelTemplate = await getTemplate('panel');
        const panelContainer = document.querySelector('.panel-container');
        panelContainer.innerHTML = Mustache.render(panelTemplate, panelData);
        
        
        requestAnimationFrame(() => {
            panelContainer.classList.add('is-active');
            overlay.classList.add('is-active');
            
            
            setTimeout(() => {
                initDatalayerAccordion();
                
                panelContainer.querySelectorAll('pre code:not([data-highlighted="true"])').forEach((block) => {
                    hljs.highlightElement(block);
                    block.setAttribute('data-highlighted', 'true');
                });
            }, 100);
        });
        
        
        document.body.style.overflow = 'hidden';
    }

    
    function closePanel() {
        const panelContainer = document.querySelector('.panel-container');
        const overlay = document.querySelector('.panel-overlay');
        
        panelContainer.classList.remove('is-active');
        overlay.classList.remove('is-active');
        
        
        document.body.style.overflow = '';
    }

    
    $(document).on('click', '.js-close-panel, .panel-overlay', function(e) {
        
        if ($(this).hasClass('panel-overlay') && e.target !== this) {
            return;
        }
        
        closePanel();
    });

    
    async function saveSnapshotsView(name) {
        const uniqueId = Date.now();
        const searchValue = $('#snapshots-table-search').val() || '';
        const filters = [];
        
        
        if (selectedHostnames.length > 0) {
            filters.push({
                type: "f_multiselect",
                field: "hostname",
                value: selectedHostnames
            });
        }
        
        if (selectedDatalayers.length > 0) {
            filters.push({
                type: "f_multiselect",
                field: "datalayer",
                value: selectedDatalayers
            });
        }
        
        if (searchValue) {
            filters.push({
                type: "f_search",
                field: "search",
                value: [searchValue]
            });
        }

        const view = {
            id: `view_${uniqueId}`,
            name: name,
            ts: Math.floor(Date.now() / 1000),
            filters: filters
        };

        
        chrome.storage.local.get(['views'], function(result) {
            const views = result.views || [];
            views.push(view);
            chrome.storage.local.set({ views: views }, function() {
                loadSnapshotsViews();
                closePanel();
            });
        });
    }

    
    $(document).on('click', '.js-save-view', async function() {
        const template = await getTemplate('panel');
        const content = `
            <div class="field">
                <label class="label">View Name</label>
                <div class="control">
                    <input class="input js-view-name" type="text" placeholder="Enter view name">
                </div>
            </div>
        `;
        
        openPanel('Save View', content, {
            name: 'Save',
            icon: 'save',
            action: 'save-view',
            style: 'is-primary'
        });
    });

    
    $(document).on('click', '[data-action="save-view"]', function() {
        const viewName = $('.js-view-name').val().trim();
        if (viewName) {
            saveSnapshotsView(viewName);
        }
    });

    
    function loadSnapshots() {
        chrome.storage.local.get('snapshots', async function(result) {
            const rawData = result.snapshots || [];
            snapshotCollection = SnapshotCollection.fromRawData(rawData);
            snapshotCollection.sortByTimestampDesc();
            renderView();
            console.log('Données brutes chargées:', rawData.length);
        });
    }

    
    function loadSnapshotsViews() {
        chrome.storage.local.get(['views'], function(result) {
            snapshotsViews = result.views || [];
            
            snapshotsViews.sort((a, b) => a.name.localeCompare(b.name));
            renderView();
        });
    }

    
    function extractUniqueValues() {
        return {
            hostnames: snapshotCollection.getUniqueHostnames(),
            datalayers: snapshotCollection.getUniqueDatalayers()
        };
    }

    
    const customFilter = function(settings, data, dataIndex) {
        const snapshotHost = data[3]; 
        const snapshotDataLayer = data[6]; 
        
        
        const hostMatch = selectedHostnames.length === 0 || selectedHostnames.includes(snapshotHost);
        const dataLayerMatch = selectedDatalayers.length === 0 || selectedDatalayers.includes(snapshotDataLayer);
        
        
        const searchValue = $('#snapshots-table-search').val().toLowerCase();
        const searchMatch = !searchValue || data.some(cell => 
            cell && cell.toString().toLowerCase().includes(searchValue)
        );
        
        return hostMatch && dataLayerMatch && searchMatch;
    };

    
    function applyFilters() {
        const table = $('#snapshots-table').DataTable();
        
        
        if ($.fn.dataTable.ext.search.length > 0) {
            $.fn.dataTable.ext.search.pop();
        }
        
        
        $.fn.dataTable.ext.search.push(customFilter);
        
        
        table.draw();
    }

    
    function resetFiltersAndUpdate() {
        
        selectedHostnames = [];
        selectedDatalayers = [];
        
        
        $('.js-filter-hostname, .js-filter-datalayer').each(function() {
            const $multiselect = $(this);
            $multiselect.find('input[type="checkbox"]').prop('checked', false);
            updateSelectedDisplay($multiselect);
        });
        
        
        const $search = $('#snapshots-table-search');
        $search.val('');
        
        
        const table = $('#snapshots-table').DataTable();
        
        
        table.search('').draw();
        
        
        applyFilters();
        
        
        checkSelectedSnapshots();
    }

    
    function applyViewFilters(view) {
        const table = $('#snapshots-table').DataTable();
        
        view.filters.forEach(filter => {
            switch (filter.field) {
                case 'hostname':
                    selectedHostnames = filter.value;
                    filter.value.forEach(hostname => {
                        $('.js-filter-hostname').find(`input[value="${hostname}"]`).prop('checked', true);
                    });
                    updateSelectedDisplay($('.js-filter-hostname'));
                    break;
                    
                case 'datalayer':
                    selectedDatalayers = filter.value;
                    filter.value.forEach(datalayer => {
                        $('.js-filter-datalayer').find(`input[value="${datalayer}"]`).prop('checked', true);
                    });
                    updateSelectedDisplay($('.js-filter-datalayer'));
                    break;
                    
                case 'search':
                    if (filter.value && filter.value.length > 0) {
                        const searchValue = filter.value[0];
                        $('#snapshots-table-search').val(searchValue);
                        table.search(searchValue);
                    }
                    break;
            }
        });
        
        
        applyFilters();
    }

    
    $(document).on('click', '[data-snapshots-view-id].snapshot-views-item', function(e) {
        
        if ($(e.target).closest('.js-delete-snapshots-view').length) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        
        const viewId = $(this).closest('.snapshot-views-item').data('snapshots-view-id');
        
        if (viewId === 'none') {
            resetFiltersAndUpdate();
        } else {
            
            const view = snapshotsViews.find(v => v.id === viewId);
            if (view) {
                resetFiltersAndUpdate();
                
                
                applyViewFilters(view);
            }
        }
    });

    
    $(document).on('click', '.js-delete-snapshots-view', async function(e) {
        e.preventDefault();
        e.stopPropagation();
        const viewId = $(this).data('snapshots-view-id');
        const view = snapshotsViews.find(v => v.id === viewId);
        
        if (view) {
            const template = await getTemplate('panel');
            const content = `
                <div class="message">
                    <div class="message-body">
                        Are you sure you want to delete the view "${view.name}"?
                    </div>
                </div>
            `;
            
            openPanel('Delete View', content, {
                name: 'Delete',
                icon: 'trash',
                action: `delete-view-${viewId}`,
                style: 'is-danger'
            });
        }
    });

    
    $(document).on('click', '[data-action^="delete-view-"]', function(e) {
        e.preventDefault();
        const viewId = $(this).data('action').replace('delete-view-', '');
        
        chrome.storage.local.get(['views'], function(result) {
            const views = result.views || [];
            const updatedViews = views.filter(v => v.id !== viewId);
            
            chrome.storage.local.set({ views: updatedViews }, function() {
                snapshotsViews = updatedViews;
                renderView();
                closePanel();
            });
        });
    });

    
    async function renderView() {
        const mainView = document.getElementById('main-view');
        if (!mainView) return;
    
        try {
            if (currentView === 'snapshots') {
                
                requestAnimationFrame(async () => {
                    const uniqueValues = extractUniqueValues();
                    
                    
                    
                    const processedSnapshots = snapshotCollection.toArray().map(snapshot => {
                        const rowData = snapshot.getTableRowData();
                        return {
                            ...rowData,
                            
                            id: rowData.id,
                            formattedDate: rowData.formattedDate,
                            formattedTime: rowData.formattedTime,
                            context: rowData.context,
                            eventList: rowData.eventList,
                            timestamp: rowData.timestamp
                        };
                    });
    
                    const data = {
                        snapshots: processedSnapshots,
                        hostnames: uniqueValues.hostnames,
                        datalayers: uniqueValues.datalayers,
                        snapshotsViews: snapshotsViews,
                        numberOfSelected: 0,
                        numberOfSnapshots: snapshotCollection.length
                    };
    
                    
                    const template = await getTemplate('view-snapshots');
                    const renderedContent = Mustache.render(template, data);
                    
                    
                    const fragment = document.createDocumentFragment();
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = renderedContent;
                    while (tempDiv.firstChild) {
                        fragment.appendChild(tempDiv.firstChild);
                    }
                    
                    
                    mainView.innerHTML = '';
                    mainView.appendChild(fragment);
    
                    
                    
                    const table = initializeSnapshotsDataTable();
    
                    
                    $('.js-select-all-snapshots').on('change', function() {
                        const isChecked = $(this).prop('checked');
                        table.rows({ page: 'current' }).nodes().each(function(node) {
                            $(node).find('.js-select-snapshot').prop('checked', isChecked);
                        });
                        checkSelectedSnapshots();
                    });
    
                    
                    initializeMultiselectFilters();
                    
                    
                    setTimeout(() => {
                        if (currentView === 'snapshots') {
                            
                            if (selectedHostnames.length > 0 || selectedDatalayers.length > 0 || $('#snapshots-table-search').val()) {
                                applyFilters();
                            }
                        }
                    }, 100); 
                });
            }
        } catch (error) {
            console.error('Error rendering view:', error);
        }
    }

    
    function initializeMultiselectFilters() {
        $('.js-filter-hostname, .js-filter-datalayer').each(function() {
            const $multiselect = $(this);
            const $selected = $multiselect.find('.multiselect-selected');
            const $search = $multiselect.find('.multiselect-search input');
            const $options = $multiselect.find('.multiselect-options');
    
            
            $selected.off('click');
            $search.off('input');
            $options.find('input[type="checkbox"]').off('change');
    
            
            if ($multiselect.hasClass('js-filter-hostname')) {
                $multiselect.find('input[type="checkbox"]').each(function() {
                    $(this).prop('checked', selectedHostnames.includes($(this).val()));
                });
            } else if ($multiselect.hasClass('js-filter-datalayer')) {
                $multiselect.find('input[type="checkbox"]').each(function() {
                    $(this).prop('checked', selectedDatalayers.includes($(this).val()));
                });
            }
    
            
            updateSelectedDisplay($multiselect);
    
            
            $selected.on('click', function(e) {
                e.stopPropagation();
                
                $('.multiselect').not($multiselect).removeClass('is-active');
                $multiselect.toggleClass('is-active');
            });
    
            $search.on('input', function() {
                const searchValue = $(this).val().toLowerCase();
                $options.find('.multiselect-option').each(function() {
                    const text = $(this).text().toLowerCase();
                    $(this).toggle(text.includes(searchValue));
                });
            });
    
            
            $options.find('input[type="checkbox"]').on('change', function() {
                const value = $(this).val();
                const isChecked = $(this).prop('checked');
                
                if ($multiselect.hasClass('js-filter-hostname')) {
                    if (isChecked) {
                        selectedHostnames.push(value);
                    } else {
                        selectedHostnames = selectedHostnames.filter(h => h !== value);
                    }
                } else if ($multiselect.hasClass('js-filter-datalayer')) {
                    if (isChecked) {
                        selectedDatalayers.push(value);
                    } else {
                        selectedDatalayers = selectedDatalayers.filter(d => d !== value);
                    }
                }
    
                updateSelectedDisplay($multiselect);
                
                applyFilters();
            });
        });
    }

    
    function initializeSnapshotsDataTable() {
        const groupColumn = 1; 
        const table = $('#snapshots-table').DataTable({
            dom: 'rt<"bottom"lip>',
            ordering: false,
            pageLength: 100,
            lengthChange: false,
            searching: true,
            lengthMenu: [[10, 25, 50, 100, -1], [10, 25, 50, 100, "All"]],
            orderCellsTop: true,
            order: [[groupColumn, 'desc']], 
            stateSave: true,
            language: {
                lengthMenu: "<span class='table-length-menu'>Show</span> _MENU_ <span class='table-length-menu'>entries</span>",
                info: "<span class='table-info'>Showing</span> _START_ <span class='table-info'>to</span> _END_ <span class='table-info'>of</span> _TOTAL_ <span class='table-info'>entries</span>  ",
                infoEmpty: "<span class='table-info'>Showing</span> 0 <span class='table-info'>to</span> 0 <span class='table-info'>of</span> 0 <span class='table-info'>entries</span>  ",
                infoFiltered: "<span class='table-info'>(filtered from</span> _MAX_ <span class='table-info'>total entries)</span>",
                search: "<span class='icon'><i class='fas fa-search'></i></span>",
                paginate: {
                    first: "First",
                    last: "Last",
                    next: "<span class='icon'><i class='fas fa-chevron-right'></i></span>",
                    previous: "<span class='icon'><i class='fas fa-chevron-left'></i></span>"
                }
            },
            columns: [
                { 
                    orderable: false,
                    className: 'has-text-centered snapshot-row-checkbox'
                },
                { 
                    visible: false
                },
                { 
                    className: 'has-text-left snapshot-row-time',
                    type: 'num',
                    render: function(data, type, row) {
                        if (type === 'sort') {
                            return row[8]; 
                        }
                        return data; 
                    }
                },
                { 
                    className: 'has-text-left snapshot-row-host'
                },
                { 
                    className: 'has-text-left snapshot-row-path'
                },
                { 
                    className: 'has-text-left snapshot-row-events'
                },
                { 
                    className: 'has-text-left snapshot-row-layer'
                },
                { 
                    orderable: false,
                    className: 'has-text-right snapshot-row-action-button'
                },
                { 
                    visible: false
                }
            ],
            drawCallback: function(settings) {
                
                $('.dataTables_wrapper .pagination').addClass('pagination-list');
                $('.dataTables_wrapper .paginate_button').addClass('pagination-link');
                $('.dataTables_wrapper .paginate_button.current').addClass('is-current');
                
                
                checkAllVisibleSelected();
                checkSelectedSnapshots();
    
                
                var api = this.api();
                var rows = api.rows({ page: 'current' }).nodes();
                var last = null;
    
                api.column(groupColumn, { page: 'current' })
                    .data()
                    .each(function(group, i) {
                        if (last !== group) {
                            $(rows).eq(i).before(
                                '<tr class="group">' +
                                    '<td colspan="8">' +
                                        '<label class="checkbox">' +
                                            '<input type="checkbox" class="js-select-group">' +
                                            '<span class="checkmark"></span>' +
                                            '<span class="group-date">' + group + '</span>' +
                                        '</label>' +
                                    '</td>' +
                                '</tr>'
                            );
                            last = group;
                        }
                    });
    
                
                updateGroupCheckboxes();
            }
        });
    
        
        setupTableSearch(table);
    
        return table;
    }
    
    
    function updateSelectionState() {
        
        updateHeaderCheckbox();
        updateGroupCheckboxes();
        
        
        checkSelectedSnapshots();
        
        
        checkAllVisibleSelected();
    }

    
    function checkSelectedSnapshots() {
        
        const selectedCount = $('#snapshots-table tbody tr[data-snapshot-id] .js-select-snapshot:checked').length;
        const $actionButtons = $('.actions-buttons-for-selected-snapshots');
        const $selected = $('.selected');
        const $total = $('.total');
        
        
        $selected.text(selectedCount);
        $total.text(snapshotCollection.length);
        
        if (selectedCount > 0) {
            $actionButtons.removeClass('hidden');
        } else {
            $actionButtons.addClass('hidden');
        }
    }

    
    function updateHeaderCheckbox() {
        const $table = $('#snapshots-table');
        const $headerCheckbox = $table.find('.js-select-all-snapshots');
        const $rowCheckboxes = $table.find('.js-select-snapshot:visible');  
        const totalCheckboxes = $rowCheckboxes.length;
        const checkedCheckboxes = $rowCheckboxes.filter(':checked').length;

        
        $headerCheckbox.prop('checked', false).removeClass('indeterminate');
        
        if (checkedCheckboxes === totalCheckboxes && totalCheckboxes > 0) {
            
            $headerCheckbox.prop('checked', true);
        } else if (checkedCheckboxes > 0) {
            
            $headerCheckbox.prop('checked', true).addClass('indeterminate');
        }
    }

    
    function updateGroupCheckboxes() {
        $('.group').each(function() {
            const $group = $(this);
            const $groupCheckbox = $group.find('.js-select-group');
            
            
            const $snapshots = $group.nextUntil('.group');
            const $snapshotCheckboxes = $snapshots.find('.js-select-snapshot:visible');
            const totalCheckboxes = $snapshotCheckboxes.length;
            const checkedCheckboxes = $snapshotCheckboxes.filter(':checked').length;

            
            $groupCheckbox.prop('checked', false).removeClass('indeterminate');
            
            if (checkedCheckboxes === totalCheckboxes && totalCheckboxes > 0) {
                
                $groupCheckbox.prop('checked', true);
            } else if (checkedCheckboxes > 0) {
                
                $groupCheckbox.prop('checked', true).addClass('indeterminate');
            }
        });
    }

    
    function checkAllVisibleSelected() {
        const visibleSnapshots = $('.snapshots-container .column:not(.hidden) .js-select-snapshot');
        const selectedSnapshots = $('.snapshots-container .column:not(.hidden) .js-select-snapshot:checked');
        const allSelected = visibleSnapshots.length > 0 && visibleSnapshots.length === selectedSnapshots.length;
        
        const $toggleButton = $('.js-toggle-all-snapshots');
        if (allSelected) {
            $toggleButton
                .removeClass('is-primary')
                .addClass('is-warning')
                .find('span:not(.icon)')
                .text('Unselect all');
            $toggleButton.find('.icon i')
                .removeClass('fa-check-square')
                .addClass('fa-square');
        } else {
            $toggleButton
                .removeClass('is-warning')
                .addClass('is-primary')
                .find('span:not(.icon)')
                .text('Select all');
            $toggleButton.find('.icon i')
                .removeClass('fa-square')
                .addClass('fa-check-square');
        }
        
        return allSelected;
    }

    
    $(document).on('change', '.js-select-snapshot', function() {
        updateSelectionState();
    });

    
    $(document).on('change', '.js-select-group', function() {
        const $groupCheckbox = $(this);
        const isChecked = $groupCheckbox.prop('checked');
        const $group = $groupCheckbox.closest('.group');
        const $snapshots = $group.nextUntil('.group');
        
        
        $snapshots.find('.js-select-snapshot').prop('checked', isChecked);
        
        
        updateSelectionState();
    });

    
    $(document).on('click', '.js-toggle-all-snapshots', function() {
        const allSelected = checkAllVisibleSelected();
        
        
        $('.snapshots-container .column:not(.hidden) .js-select-snapshot').prop('checked', !allSelected);
        
        
        updateSelectionState();
    });

    $(document).on('change', '.js-select-all-snapshots', function() {
        const $table = $('#snapshots-table');
        const isChecked = $(this).prop('checked');
        
        
        $table.find('.js-select-snapshot').prop('checked', isChecked);
        
        
        $table.find('.js-select-group').prop('checked', isChecked).removeClass('indeterminate');
        
        
        $(this).removeClass('indeterminate');
        
        
        checkSelectedSnapshots();
    });

    
    function handleSearchButtonState($searchInput, $clearButton) {
        const hasValue = Boolean($searchInput.val());
        $clearButton.toggle(hasValue);
    }

    
    $(document).on('click', '.js-clear-search', function() {
        const $searchInput = $('.js-event-search');
        $searchInput.val('').trigger('input');
    });

    
    $(document).on('input', '.js-event-search', function() {
        const searchValue = $(this).val().toLowerCase();
        $('.accordion').each(function() {
            const eventName = $(this).find('.dl-object-name').text().toLowerCase();
            $(this).toggle(eventName.includes(searchValue));
        });
    });

    
    function toggleAccordionTab($tab) {
        const viewType = $tab.hasClass('js-toggle-json') ? 'json' : 'flat';
        
        
        updateSetting('jsonDefaultViewMode', viewType === 'json');
        
        
        const $accordion = $tab.closest('.accordion');
        const $tabs = $accordion.find('.tabs');
        
        
        $tabs.find('li').removeClass('is-active');
        $tabs.find('.dl-object-toggle').removeClass('active');
        
        $tab.addClass('active');
        $tab.closest('li').addClass('is-active');
        
        
        $accordion.find('.dl-object-flat, .dl-object-json').removeClass('active');
        $accordion.find(`.dl-object-${viewType}`).addClass('active');
    }

    
    function applyDefaultViewToAccordion($accordion) {
        chrome.storage.sync.get(['settings'], function(result) {
            const settings = result.settings || {};
            const isJsonDefault = settings.jsonDefaultViewMode || false;
            const viewType = isJsonDefault ? 'json' : 'flat';

            
            const $tabs = $accordion.find('.dl-object-toggle');
            $tabs.each(function() {
                const $tab = $(this);
                const isJsonTab = $tab.hasClass('js-toggle-json');
                $tab.removeClass('active');
                if ((isJsonTab && isJsonDefault) || (!isJsonTab && !isJsonDefault)) {
                    $tab.addClass('active');
                    $tab.closest('li').addClass('is-active');
                } else {
                    $tab.closest('li').removeClass('is-active');
                }
            });

            
            $accordion.find('.dl-object-flat, .dl-object-json').removeClass('active');
            $accordion.find(`.dl-object-${viewType}`).addClass('active');
        });
    }

    
    $(document).on('click', '.accordion-toggle', function(e) {
        e.preventDefault();
        e.stopPropagation();

        const $clickedAccordion = $(this).closest('.accordion');
        const isActive = $clickedAccordion.hasClass('is-active');

        
        $('.accordion').each(function() {
            $(this).removeClass('is-active');
            $(this).find('.accordion-body').hide();
        });

        
        if (!isActive) {
            $clickedAccordion.addClass('is-active');
            $clickedAccordion.find('.accordion-body').show();

            
            applyDefaultViewToAccordion($clickedAccordion);
        }
    });

    
    $(document).on('click', '.dl-object-toggle', function(e) {
        e.preventDefault();
        e.stopPropagation();
        toggleAccordionTab($(this));
    });

    
    function updateSetting(key, value) {
        chrome.storage.sync.get(['settings'], function(result) {
            let settings = result.settings || {};
            settings[key] = value;
            chrome.storage.sync.set({settings: settings}, function() {
            });
        });
    }

    
    function copyToClipboard($button, text) {
        navigator.clipboard.writeText(text).then(() => {
            
            const $buttonText = $button.find('span:not(.icon)');
            const originalText = $buttonText.text();
            
            
            $buttonText.text('copied');
            
            
            setTimeout(() => {
                $buttonText.text(originalText);
            }, 1000);
        });
    }

    
    $(document).on('click', '.js-copy-push-datalayer', function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        const $button = $(this);
        const $accordion = $button.closest('.accordion');
        const $code = $accordion.find('code.language-json');
        const jsonText = $code.text();
        
        
        copyToClipboard($button, jsonText);
    });

    
    $(document).on('click', '.js-view-snapshot', async function(e) {
        e.preventDefault();
        const snapshotId = $(this).data('snapshot-id');
        const snapshot = snapshotCollection.findById(snapshotId);
        
        if (snapshot) {
            const detailContent = await snapshot.renderDetailView(getTemplate);
            const dataLayerContent = await snapshot.renderDataLayerContent(getTemplate);
            const content = detailContent + `<div class="snapshot-data">${dataLayerContent}</div>`;
            
            openPanel('DataLayer Snapshot', content);
            
            
            requestAnimationFrame(() => {
                initDatalayerAccordion();
                document.querySelectorAll('pre code:not([data-highlighted="true"])').forEach((block) => {
                    hljs.highlightElement(block);
                    block.setAttribute('data-highlighted', 'true');
                });
            });
        }
    });

    
    $(document).on('click', '.js-delete-selected-snapshot', async function(e) {
        e.preventDefault();
        
        const selectedCheckboxes = $('.js-select-snapshot:checked');
        const selectedIds = Array.from(selectedCheckboxes).map(checkbox => 
            $(checkbox).data('snapshot-id')
        );
        
        if (selectedIds.length === 0) return;
        
        
        const selectedSnapshots = snapshotCollection.getByIds(selectedIds);
        
        
        const templateData = {
            count: selectedSnapshots.length,
            plural: selectedSnapshots.length > 1,
            snapshots: await Promise.all(selectedSnapshots.map(async snapshot => {
                const snapshotDetails = await snapshot.renderDetailView(getTemplate);
                return {
                    ...snapshot,
                    formattedTimestamp: snapshot.formattedFullDate,
                    snapshotDetails: snapshotDetails
                };
            }))
        };
        
        
        const template = await getTemplate('snapshots-delete');
        const content = Mustache.render(template, templateData);
        
        
        openPanel('Snapshots to delete', content, {
            name: 'Delete',
            icon: 'trash',
            action: 'delete-selected-snapshots',
            style: 'is-danger'
        });
    });

    
    $(document).on('click', '[data-action="delete-selected-snapshots"]', async function(e) {
        e.preventDefault();
        const selectedCheckboxes = $('.js-select-snapshot:checked');
        const selectedIds = Array.from(selectedCheckboxes).map(checkbox => 
            $(checkbox).data('snapshot-id')
        );

        if (selectedIds.length > 0) {
            const measureData = {};
            measureData.count = selectedIds.length;

            const sizeBefore = await getStorageLocalSizeForKey('snapshots');

            chrome.storage.local.get('snapshots', function(result) {
                const storedSnapshots = result.snapshots || [];
                const updatedSnapshots = storedSnapshots.filter(s => !selectedIds.includes(s.id));

                chrome.storage.local.set({ snapshots: updatedSnapshots }, async function() {
                    const sizeAfter = await getStorageLocalSizeForKey('snapshots');
                    measureData.size = sizeBefore - sizeAfter;
                    await Measure.updateDeleteSnapshot(measureData);
                    
                    
                    snapshotCollection.removeByIds(selectedIds);
                    renderView();
                    closePanel();
                });
            });
        }
    });

    
    $(document).on('click', '.js-open-selected-snapshot-url', function(e) {
        e.preventDefault();
        const selectedCheckboxes = $('.js-select-snapshot:checked');
        const uniqueUrls = new Set();
        
        
        selectedCheckboxes.each(function() {
            const snapshotId = $(this).data('snapshot-id');
            const snapshot = snapshotCollection.findById(snapshotId);
            
            if (snapshot) {
                const url = snapshot.getFullUrl();
                uniqueUrls.add(url);
            }
        });
        
        
        uniqueUrls.forEach(url => {
            chrome.tabs.create({ url: url, active: false });
        });
    });

    
    $(document).on('click', '#snapshots-table tr[data-snapshot-id]', function(e) {
        
        if ($(e.target).closest('.button, a, input[type="checkbox"], .checkbox, label').length) {
            return;
        }
        
        const $checkbox = $(this).find('.js-select-snapshot');
        $checkbox.prop('checked', !$checkbox.prop('checked'));
        
        
        $checkbox.trigger('change');
    });

    
    function setupTableSearch(table) {
        const $searchInput = $('#snapshots-table-search');
        const $clearButton = $('.clear-search');
        
        
        handleSearchButtonState($searchInput, $clearButton);
        
        
        $searchInput.on('keyup', function() {
            table.search(this.value).draw();
            
            handleSearchButtonState($searchInput, $clearButton);
        });

        
        $clearButton.on('click', function() {
            $searchInput.val('');
            table.search('').draw();
            
            $(this).hide();
        });
    }

    
    function initializeSnapshotsDataTable() {
        const groupColumn = 1; 
        const table = $('#snapshots-table').DataTable({
            dom: 'rt<"bottom"lip>',
            ordering: false,
            pageLength: 100,
            lengthChange: false,
            searching: true,
            lengthMenu: [[10, 25, 50, 100, -1], [10, 25, 50, 100, "All"]],
            orderCellsTop: true,
            order: [[groupColumn, 'desc']], 
            stateSave: true,
            language: {
                lengthMenu: "<span class='table-length-menu'>Show</span> _MENU_ <span class='table-length-menu'>entries</span>",
                info: "<span class='table-info'>Showing</span> _START_ <span class='table-info'>to</span> _END_ <span class='table-info'>of</span> _TOTAL_ <span class='table-info'>entries</span>  ",
                infoEmpty: "<span class='table-info'>Showing</span> 0 <span class='table-info'>to</span> 0 <span class='table-info'>of</span> 0 <span class='table-info'>entries</span>  ",
                infoFiltered: "<span class='table-info'>(filtered from</span> _MAX_ <span class='table-info'>total entries)</span>",
                search: "<span class='icon'><i class='fas fa-search'></i></span>",
                paginate: {
                    first: "First",
                    last: "Last",
                    next: "<span class='icon'><i class='fas fa-chevron-right'></i></span>",
                    previous: "<span class='icon'><i class='fas fa-chevron-left'></i></span>"
                }
            },
            columns: [
                { 
                    orderable: false,
                    className: 'has-text-centered snapshot-row-checkbox'
                },
                { 
                    visible: false
                },
                { 
                    className: 'has-text-left snapshot-row-time',
                    type: 'num',
                    render: function(data, type, row) {
                        if (type === 'sort') {
                            return row[8]; 
                        }
                        return data; 
                    }
                },
                { 
                    className: 'has-text-left snapshot-row-host'
                },
                { 
                    className: 'has-text-left snapshot-row-path'
                },
                { 
                    className: 'has-text-left snapshot-row-events'
                },
                { 
                    className: 'has-text-left snapshot-row-layer'
                },
                { 
                    orderable: false,
                    className: 'has-text-right snapshot-row-action-button'
                },
                { 
                    visible: false
                }
            ],
            drawCallback: function(settings) {
                
                $('.dataTables_wrapper .pagination').addClass('pagination-list');
                $('.dataTables_wrapper .paginate_button').addClass('pagination-link');
                $('.dataTables_wrapper .paginate_button.current').addClass('is-current');
                
                
                checkAllVisibleSelected();
                checkSelectedSnapshots();
    
                
                var api = this.api();
                var rows = api.rows({ page: 'current' }).nodes();
                var last = null;
    
                api.column(groupColumn, { page: 'current' })
                    .data()
                    .each(function(group, i) {
                        if (last !== group) {
                            $(rows).eq(i).before(
                                '<tr class="group">' +
                                    '<td colspan="8">' +
                                        '<label class="checkbox">' +
                                            '<input type="checkbox" class="js-select-group">' +
                                            '<span class="checkmark"></span>' +
                                            '<span class="group-date">' + group + '</span>' +
                                        '</label>' +
                                    '</td>' +
                                '</tr>'
                            );
                            last = group;
                        }
                    });
    
                
                updateGroupCheckboxes();
            }
        });
    
        
        setupTableSearch(table);
    
        return table;
    }

    
    loadSnapshots();
    loadSnapshotsViews();
});