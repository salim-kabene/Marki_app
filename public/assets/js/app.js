// script.js

// Fonction pour gérer l'activation des éléments du menu
function activateMenuItem(event) {
    // Supprimez la classe active de tous les éléments
    document.querySelectorAll('.sidebar__item').forEach(item => {
        item.classList.remove('active');
    });
    
    // Ajoutez la classe active à l'élément cliqué
    event.currentTarget.classList.add('active');
}

// Fonction pour charger le contenu d'une page
function loadPage(page) {
    const mainContent = document.getElementById('main-content');
    
    // Utilisez fetch pour charger le contenu de la page
    fetch(`pages/${page}.html`)
        .then(response => {
            if (!response.ok) {
                throw new Error('Erreur de chargement de la page');
            }
            return response.text();
        })
        .then(html => {
            mainContent.innerHTML = html; // Insère le contenu dans le conteneur
            if(page === "settings")
                addSaveButtonListener();
        })
        .catch(error => {
            console.error('Erreur:', error);
            mainContent.innerHTML = '<p>Erreur de chargement de la page.</p>';
        });
}
// Ajoutez des écouteurs d'événements à chaque élément du menu
document.querySelectorAll('.sidebar__item').forEach(item => {
    item.addEventListener('click', activateMenuItem);
});

// Ajoutez des écouteurs d'événements aux éléments de la sidebar
document.querySelectorAll('.sidebar__item').forEach(item => {
    item.addEventListener('click', function() {
        const page = this.getAttribute('data-page'); // Récupère le nom de la page
        loadPage(page); // Charge la page correspondante
    });
});

// Charge la page par défaut ( dashboard )
// loadPage('dashboard');
// loadPage('settings');
// loadPage('patients');
// loadPage('lists');

// la partie de sauvgarde des mise a jour des infos du medecin
// Ajoutez l'écouteur d'événements pour le bouton "Enregistrer"
// Fonction pour ajouter l'écouteur d'événements au bouton "Enregistrer"
function addSaveButtonListener() {
    const saveButton = document.getElementById('save-button');
    if (saveButton) {
        saveButton.addEventListener('click', function() {
            const nom = document.getElementById('nom-prenom').value;
            const specialite = document.getElementById('specialite').value;
            const telephone = document.getElementById('telephone').value;
            const email = document.getElementById('email').value;
            const adresse = document.getElementById('adresse').value;

            // Ici, vous pouvez envoyer ces données à votre base de données
            console.log('Nom et Prénom:', nom);
            console.log('Spécialité:', specialite);
            console.log('Téléphone:', telephone);
            console.log('Email:', email);
            console.log('Adresse du cabinet:', adresse);

            // Affichez un message de confirmation ou effectuez d'autres actions
            // alert('Modifications enregistrées !');

            // Ajoute la classe pour l'animation
            this.classList.toggle('clicked');

            // Retire la classe après un court délai pour permettre la réanimation
            setTimeout(() => {
                this.classList.remove('clicked');
            }, 300); // Correspond à la durée de l'animation
        });
    } else {
        console.error("Le bouton 'Enregistrer' n'a pas été trouvé.");
    }
}
