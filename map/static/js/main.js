function loaded()
{
    var mymap = L.map('map').setView([-43.5, 172.5], 13);
    L.tileLayer("//{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "\u00a9 <a href=\"http://www.openstreetmap.org/copyright\">OpenStreetMap</a> contributors",
        maxZoom: 18,
        id: 'OSM',
    }).addTo(mymap);
}
