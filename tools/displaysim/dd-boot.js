// Final boot step after every Displaysim module is loaded: refresh the UI from restored state.
(function () {
    'use strict';
    const DD = window.DD;
    if (DD.onPages) DD.onPages();
    if (DD.onProfile) DD.onProfile(DD.profile());
    renderElementList(); drawPreview();
    if (DD.maybeWelcome) DD.maybeWelcome();
})();
