// =====================================================
// BAND DAW - ADMIN
// =====================================================

let selectedFiles = [];

const loginSection =
    document.getElementById("loginSection");

const adminSection =
    document.getElementById("adminSection");

const loginMessage =
    document.getElementById("loginMessage");


// =====================================================
// LOGIN
// =====================================================

document.getElementById("loginBtn")
    .addEventListener("click", login);


async function login() {

    const email =
        document.getElementById("email").value.trim();

    const password =
        document.getElementById("password").value;

    if (!email || !password) {

        loginMessage.textContent =
            "Inserisci email e password.";

        return;
    }

    loginMessage.textContent =
        "Accesso...";

    const {
        data,
        error
    } =
        await supabaseClient.auth.signInWithPassword({
            email,
            password
        });

    if (error) {

        loginMessage.textContent =
            error.message;

        return;
    }

    showAdmin(data.user);

}


// =====================================================
// MOSTRA ADMIN
// =====================================================

function showAdmin(user) {

    loginSection.classList.add("hidden");

    adminSection.classList.remove("hidden");

    document.getElementById("adminEmail")
        .textContent =
        user.email;

    loadAdminSongs();

}


// =====================================================
// CONTROLLO SESSIONE
// =====================================================

async function checkSession() {

    const {
        data: {
            session
        }
    } =
        await supabaseClient.auth.getSession();

    if (session) {

        showAdmin(session.user);

    }

}


// =====================================================
// LOGOUT
// =====================================================

document.getElementById("logoutBtn")
    .addEventListener(
        "click",
        async () => {

            await supabaseClient.auth.signOut();

            location.reload();

        }
    );


// =====================================================
// FILE SELEZIONATI
// =====================================================

document.getElementById("stemFiles")
    .addEventListener(
        "change",
        event => {

            selectedFiles =
                Array.from(event.target.files);

            renderSelectedFiles();

        }
    );


function renderSelectedFiles() {

    const container =
        document.getElementById(
            "selectedFiles"
        );

    container.innerHTML = "";

    selectedFiles.forEach(
        (file, index) => {

            const row =
                document.createElement("div");

            row.className =
                "selected-file";

            row.innerHTML = `

                <input
                    type="text"
                    value="${escapeHtml(
                        cleanStemName(file.name)
                    )}"
                    data-index="${index}"
                    class="stem-name"
                >

                <span>
                    ${formatBytes(file.size)}
                </span>

            `;

            container.appendChild(row);

        }
    );

}


// =====================================================
// UPLOAD
// =====================================================

document.getElementById("uploadBtn")
    .addEventListener(
        "click",
        uploadSong
    );


async function uploadSong() {

    const title =
        document.getElementById("newTitle")
            .value
            .trim();

    const artist =
        document.getElementById("newArtist")
            .value
            .trim();

    const message =
        document.getElementById(
            "uploadMessage"
        );

    if (!title) {

        message.textContent =
            "Inserisci il titolo.";

        return;
    }

    if (!selectedFiles.length) {

        message.textContent =
            "Seleziona almeno uno stem.";

        return;
    }


    const {
        data: {
            user
        }
    } =
        await supabaseClient.auth.getUser();


    if (!user) {

        message.textContent =
            "Sessione scaduta.";

        return;
    }


    message.textContent =
        "Creo il brano...";


    // -------------------------------------------------
    // CREA RECORD BRANO
    // -------------------------------------------------

    const {
        data: song,
        error: songError
    } =
        await supabaseClient
            .from("songs")
            .insert({

                title,
                artist,
                created_by: user.id

            })
            .select()
            .single();


    if (songError) {

        console.error(songError);

        message.textContent =
            songError.message;

        return;
    }


    // -------------------------------------------------
    // UPLOAD FILE
    // -------------------------------------------------

    const nameInputs =
        document.querySelectorAll(
            ".stem-name"
        );


    try {

        for (
            let i = 0;
            i < selectedFiles.length;
            i++
        ) {

            const file =
                selectedFiles[i];

            const stemName =
                nameInputs[i]
                    .value
                    .trim() ||
                cleanStemName(file.name);


            message.textContent =
                `Caricamento ${i + 1}/${selectedFiles.length}: ${stemName}`;


            const safeFileName =
                sanitizeFileName(file.name);


            const path =
                `${song.id}/${Date.now()}-${safeFileName}`;


            const {
                error: uploadError
            } =
                await supabaseClient
                    .storage
                    .from("stems")
                    .upload(
                        path,
                        file,
                        {
                            contentType:
                                file.type ||
                                "audio/mpeg",
                            upsert: false
                        }
                    );


            if (uploadError) {

                throw uploadError;

            }


            // -------------------------------------------------
            // SALVA STEM NEL DATABASE
            // -------------------------------------------------

            const {
                error: stemError
            } =
                await supabaseClient
                    .from("stems")
                    .insert({

                        song_id:
                            song.id,

                        name:
                            stemName,

                        file_path:
                            path,

                        file_type:
                            file.type

                    });


            if (stemError) {

                throw stemError;

            }


            const progress =
                ((i + 1) /
                    selectedFiles.length) *
                100;


            document.getElementById(
                "progressBar"
            ).style.width =
                progress + "%";

        }


        message.textContent =
            "✓ Brano caricato correttamente!";


        resetForm();

        loadAdminSongs();


    } catch (error) {

        console.error(error);

        message.textContent =
            "Errore durante il caricamento: " +
            error.message;

    }

}


// =====================================================
// LISTA ADMIN
// =====================================================

async function loadAdminSongs() {

    const container =
        document.getElementById(
            "adminSongs"
        );

    const {
        data,
        error
    } =
        await supabaseClient
            .from("songs")
            .select("*")
            .order("created_at", {
                ascending: false
            });


    if (error) {

        container.textContent =
            error.message;

        return;
    }


    if (!data.length) {

        container.textContent =
            "Nessun brano.";

        return;

    }


    container.innerHTML = "";


    data.forEach(song => {

        const row =
            document.createElement("div");

        row.className =
            "admin-song";


        row.innerHTML = `

            <div>
                <strong>
                    ${escapeHtml(song.title)}
                </strong>

                <span>
                    ${escapeHtml(song.artist || "")}
                </span>
            </div>

            <button
                class="delete-button"
                data-id="${song.id}">
                ELIMINA
            </button>

        `;


        row.querySelector(
            ".delete-button"
        )
        .addEventListener(
            "click",
            () => deleteSong(song)
        );


        container.appendChild(row);

    });

}


// =====================================================
// ELIMINA BRANO
// =====================================================

async function deleteSong(song) {

    const confirmDelete =
        confirm(
            `Eliminare "${song.title}"?`
        );


    if (!confirmDelete)
        return;


    const {
        data: stems,
        error: stemsError
    } =
        await supabaseClient
            .from("stems")
            .select("file_path")
            .eq(
                "song_id",
                song.id
            );


    if (stemsError) {

        alert(stemsError.message);

        return;

    }


    // elimina file storage

    if (stems.length) {

        const paths =
            stems.map(
                stem =>
                    stem.file_path
            );


        const {
            error
        } =
            await supabaseClient
                .storage
                .from("stems")
                .remove(paths);


        if (error) {

            alert(error.message);

            return;

        }

    }


    // elimina record song
    // gli stem vengono eliminati
    // automaticamente dal database

    const {
        error
    } =
        await supabaseClient
            .from("songs")
            .delete()
            .eq(
                "id",
                song.id
            );


    if (error) {

        alert(error.message);

        return;

    }


    loadAdminSongs();

}


// =====================================================
// RESET
// =====================================================

function resetForm() {

    document.getElementById(
        "newTitle"
    ).value = "";

    document.getElementById(
        "newArtist"
    ).value = "";

    document.getElementById(
        "stemFiles"
    ).value = "";

    document.getElementById(
        "selectedFiles"
    ).innerHTML = "";

    document.getElementById(
        "progressBar"
    ).style.width = "0%";

    selectedFiles = [];

}


// =====================================================
// UTILITÀ
// =====================================================

function cleanStemName(filename) {

    return filename
        .replace(/\.[^/.]+$/, "")
        .replace(/[-_]/g, " ");

}


function sanitizeFileName(filename) {

    return filename
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9._-]/g, "_");

}


function formatBytes(bytes) {

    if (bytes < 1024)
        return bytes + " B";

    if (bytes < 1024 * 1024)
        return (
            bytes / 1024
        ).toFixed(1) + " KB";

    return (
        bytes /
        1024 /
        1024
    ).toFixed(1) + " MB";

}


function escapeHtml(value) {

    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

}


// =====================================================
// INIT
// =====================================================

checkSession();
