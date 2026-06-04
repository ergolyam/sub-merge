(function () {
    function done(button, text) {
        button.textContent = text;
        setTimeout(function () {
            button.textContent = "Copy";
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
        done(button, ok ? "Copied" : "Select and copy");
    }

    document.addEventListener("click", function (event) {
        var button = event.target;

        if (!button.classList || !button.classList.contains("copy-link")) {
            return;
        }

        var text = button.getAttribute("data-link");

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function () {
                done(button, "Copied");
            }, function () {
                fallback(button, text);
            });
            return;
        }

        fallback(button, text);
    });
})();
