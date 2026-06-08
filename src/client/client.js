(function () {
    function done(button, ok) {
        var stateClass = ok ? "copy-link--copied" : "copy-link--failed";
        var label = ok ? "Copied" : "Copy failed";

        button.classList.remove("copy-link--copied", "copy-link--failed");
        void button.offsetWidth;
        button.classList.add(stateClass);
        button.setAttribute("aria-label", label);
        button.setAttribute("title", label);
        clearTimeout(button.copyTimer);
        button.copyTimer = setTimeout(function () {
            button.classList.remove(stateClass);
            button.setAttribute("aria-label", "Copy link");
            button.setAttribute("title", "Copy link");
        }, 1600);
    }

    function fallback(button, text) {
        var area = document.createElement("textarea");
        area.value = text;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.left = "-9999px";
        document.body.appendChild(area);
        area.select();

        var ok = false;
        try {
            ok = document.execCommand("copy");
        } catch (e) {
        }

        document.body.removeChild(area);
        done(button, ok);
    }

    document.addEventListener("click", function (event) {
        var button = event.target;

        if (!button.classList || !button.classList.contains("copy-link")) {
            return;
        }

        var text = button.getAttribute("data-link");

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function () {
                done(button, true);
            }, function () {
                fallback(button, text);
            });
            return;
        }

        fallback(button, text);
    });
})();
