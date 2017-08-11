document.addEventListener("readystatechange", () => {
    if (document.readyState === "complete") {
        var usernameInput = document.getElementById("usernameBox");
        var passwordInput = document.getElementById("passwordBox");
        var loginButton = document.getElementById("loginButton");
        var statusLabel = document.getElementById("statusLabel");

        function getParameterByName(name, url) {
            if (!url) url = window.location.href;
            name = name.replace(/[\[\]]/g, "\\$&");
            var regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)"), 
                results = regex.exec(url);
            if (!results) return null;
            if (!results[2]) return '';
            return decodeURIComponent(results[2].replace(/\+/g, " "));
        }

        var token = getParameterByName("login_token");
        loginButton.addEventListener("click", () => {
            var request = $.get("/login", {
                login_token: token.toString(),
                username: usernameInput.value.toString(),
                password: passwordInput.value.toString()
            }, (data, status) => {
                window.location.assign(data);
            });

            request.fail(() => {
                statusLabel.textContent = "Invalid username or password";
            });
        });
    }
});