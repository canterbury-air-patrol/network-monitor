var known_nodes = [];

class NetworkNode {
    constructor(pk, name) {
        this.pk = pk;
        this.name = name;
    }
}

function nodeFind(pk) {
    for (var n in known_nodes) {
        if (known_nodes[n].pk == pk) {
            return known_nodes[n];
        }
    }
    return null;
}

function nodeAdd(node) {
    var existing = nodeFind(node.pk);
    if (existing === null)
    {
        let new_node = new NetworkNode(node.pk, node.fields.name);
        known_nodes.push(new_node);
        return new_node;
    }
    return existing;
}

function UINodeSelected(node_pk) {
    var node = nodeFind(node_pk);
    $(".node-selected").removeClass('node-selected');
    $(`#node-${node_pk}`).addClass('node-selected');
}

function UINodeCreate(node) {
    $("#nodes").append(`<div id='node-${node.pk}' class='node' onclick='UINodeSelected(${node.pk})'>${node.name}</div>`);
}

function updateNodes()
{
    $.get('/data/nodes/list', (data) => {
        for (n in data) {
            if (nodeFind(data[n].pk) === null) {
                var node = nodeAdd(data[n]);
                UINodeCreate(node);
            }
        }
    });
}

function loaded()
{
    var mymap = L.map('map').setView([-43.5, 172.5], 13);
    L.tileLayer("//{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "\u00a9 <a href=\"http://www.openstreetmap.org/copyright\">OpenStreetMap</a> contributors",
        maxZoom: 18,
        id: 'OSM',
    }).addTo(mymap);

    updateNodes();
}
