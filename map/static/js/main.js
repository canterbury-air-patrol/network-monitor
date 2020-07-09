var known_nodes = [];

class NetworkNode {
    constructor(pk, name) {
        this.pk = pk;
        this.name = name;
    }

    getURL(path) {
        return `/data/nodes/${this.pk}/${path}`;
    }

    getSnapshotURL(snapshot_id, path) {
        if (snapshot_id == 0) {
            return `/data/nodes/${this.pk}/snapshots/latest/${path}`;
        } else {
            return `/data/nodes/${this.pk}/snapshots/${snapshot_id}/${path}`;
        }
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

function UIClearNodeData()
{
    $('#node-interfaces').html('');
    $('#node-addresses').html('');
    $('#node-snapshots').html('');
    $('#node-routes').html('');
}

function UILoadNodeInterfaces(node)
{
    $.get(node.getURL('interfaces/list/'), (data) => {
        for (n in data) {
            $('#node-interfaces').append(`<div class='node-interface'>${data[n].fields.ifname}</div>`);
        }
    });
}

function UILoadNodeAddresses(node)
{
    $.get(node.getURL('addresses/list/'), (data) => {
        for (n in data) {
            $('#node-addresses').append(`<div class='node-address'>${data[n].fields.address}</div>`);
        }
    });
}

function UIClearNodeSnapshotData()
{
    $("#node-links").html('');
    $("#node-routes").html('');
}

function UILoadNodeSnapshotData(node, snapshot_id)
{
    $.get(node.getSnapshotURL(snapshot_id, 'wireless/list/'), (data) => {
        for (n in data) {
            $('#node-links').append(`<div class='node-link'>${data[n].fields.neighbour_address} (${data[n].fields.signal_strength})</div>`);
        }
    });
    $.get(node.getSnapshotURL(snapshot_id, 'routes/list/'), (data) => {
        for (n in data) {
            $('#node-routes').append(`<div class='node-route'>${data[n].fields.address}</div>`);
        }
    });
}

var selected_snapshot = 0;
function UISnapShotSelected(node_id, snapshot_id)
{
    $(".snapshot-selected").removeClass('snapshot-selected');
    UIClearNodeSnapshotData();
    if (snapshot_id == selected_snapshot) {
        selected_snapshot = 0;
    } else {
        selected_snapshot = snapshot_id;
    }
    var node = nodeFind(node_id);
    $(`#snapshot-${snapshot_id}`).addClass('snapshot-selected');
    UILoadNodeSnapshotData(node, snapshot_id);
}

function UILoadSnapShots(node)
{
    $.get(node.getURL('snapshots/list/'), (data) => {
        for (n in data) {
            $('#node-snapshots').append(`<div id='snapshot-${data[n].pk}' class='node-snapshot' onclick='UISnapShotSelected(${node.pk},${data[n].pk})'>${data[n].fields.timestamp}</div>`);
        }
        UISnapShotSelected(node.pk, 0);
    });
}


function UILoadNodeData(node)
{
    UILoadNodeInterfaces(node);
    UILoadNodeAddresses(node);
    UILoadSnapShots(node);
}

var selected_node = 0;
function UINodeSelected(node_pk) {
    $(".node-selected").removeClass('node-selected');
    UIClearNodeData();

    if (node_pk == selected_node) {
        selected_node = 0;
        return;
    }
    selected_node = node_pk;
    var node = nodeFind(node_pk);
    $(`#node-${node_pk}`).addClass('node-selected');

    UILoadNodeData(node);
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
