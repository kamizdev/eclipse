// =====================================================
// ECLIPSE - CLOUDFLARE R2 CLIENT
// =====================================================
// Questo file deve essere caricato DOPO supabase-config.js
// e PRIMA di app.js/admin.js.
//
// Il browser non riceve mai credenziali R2.
// Upload/delete passano dal Cloudflare Worker, che verifica
// il JWT Supabase e il ruolo admin.
// =====================================================

window.ECLIPSE_R2_URL =
    "https://eclipse-audio.kamizdev.workers.dev";


function r2UrlPath(path) {

    return String(path)
        .split("/")
        .map(encodeURIComponent)
        .join("/");

}


window.eclipseR2AudioUrl = function (path) {

    if (!window.ECLIPSE_R2_URL ||
        window.ECLIPSE_R2_URL.includes("YOUR-WORKER")) {

        throw new Error(
            "Configura ECLIPSE_R2_URL in r2-client.js."
        );

    }

    return (
        window.ECLIPSE_R2_URL.replace(/\/$/, "") +
        "/audio/" +
        r2UrlPath(path)
    );

};


async function getSupabaseAccessToken() {

    const {
        data,
        error
    } =
        await supabaseClient.auth.getSession();

    if (error)
        throw error;

    const token =
        data &&
        data.session &&
        data.session.access_token;

    if (!token)
        throw new Error(
            "Sessione admin scaduta. Effettua nuovamente il login."
        );

    return token;

}


window.eclipseR2Upload = async function (
    file,
    path
) {

    const token =
        await getSupabaseAccessToken();

    const response =
        await fetch(
            window.ECLIPSE_R2_URL +
            "/upload",
            {
                method: "POST",

                headers: {
                    "Authorization":
                        "Bearer " + token,

                    "Content-Type":
                        file.type ||
                        "audio/mpeg",

                    "X-R2-Path":
                        path
                },

                body: file
            }
        );

    if (!response.ok) {

        let message =
            `Upload R2 fallito (HTTP ${response.status})`;

        try {

            const body =
                await response.json();

            if (body && body.error)
                message =
                    body.error;

        } catch {}

        throw new Error(message);

    }

    return await response.json();

};


window.eclipseR2Delete = async function (
    paths
) {

    if (!Array.isArray(paths) ||
        !paths.length)
        return;

    const token =
        await getSupabaseAccessToken();

    const response =
        await fetch(
            window.ECLIPSE_R2_URL +
            "/delete",
            {
                method: "POST",

                headers: {
                    "Authorization":
                        "Bearer " + token,

                    "Content-Type":
                        "application/json"
                },

                body: JSON.stringify({
                    paths
                })
            }
        );

    if (!response.ok) {

        let message =
            `Delete R2 fallito (HTTP ${response.status})`;

        try {

            const body =
                await response.json();

            if (body && body.error)
                message =
                    body.error;

        } catch {}

        throw new Error(message);

    }

    return await response.json();

};
