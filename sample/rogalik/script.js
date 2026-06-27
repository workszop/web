/* ===========================================================
   script.js — INTERAKTYWNOŚĆ strony „Rogalik"
   JavaScript nie zmienia wyglądu ani treści w spoczynku.
   Sprawia, że strona REAGUJE na działania użytkownika i na czas.
   Wyłącz ten plik, a przycisk i status „otwarte/zamknięte" przestaną działać.
   =========================================================== */

// 1) Licznik zamówionych rogalików — reaguje na kliknięcie przycisku.
let liczba = 0;
const przycisk = document.getElementById("orderBtn");
const licznik = document.getElementById("orderCount");

przycisk.addEventListener("click", function () {
  liczba = liczba + 1;
  licznik.textContent = "Zamówiono rogalików: " + liczba + " 🥐";
});

// 2) „Czy teraz otwarte?" — wynik zależy od aktualnego dnia i godziny.
const teraz = new Date();
const dzien = teraz.getDay();        // 0 = niedziela, 1 = poniedziałek, ...
const godzina = teraz.getHours();

let otwarte = false;
if (dzien >= 1 && dzien <= 5 && godzina >= 6 && godzina < 19) otwarte = true; // pon–pt
if (dzien === 6 && godzina >= 7 && godzina < 15) otwarte = true;              // sobota

const status = document.getElementById("openNow");
status.textContent = otwarte ? "🟢 Teraz otwarte — zapraszamy!" : "🔴 Teraz nieczynne.";
status.style.color = otwarte ? "#2e7d32" : "#c0392b";
