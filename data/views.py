import json

from django.contrib.gis.geos import Point
from django.core import serializers
from django.core.exceptions import ObjectDoesNotExist
from django.http import HttpResponse, HttpResponseNotFound
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from .models import Node, NodeAddress, NodeInterface, NodeRoute, NodeSnapshot


def index(request):
    return HttpResponse("Hello, world. You're at the data index.")


def nodes_list(request):
    data = serializers.serialize("json", Node.objects.all())
    return HttpResponse(data, content_type="application/json")


def nodes_positions(request):
    nodes = Node.objects.all()
    positions = []
    for node in nodes:
        try:
            snapshot = NodeSnapshot.objects.filter(node=node).order_by("-captured_at")[0]
            positions.append(snapshot)
        except IndexError:
            pass
    geojson_data = serializers.serialize(
        "geojson",
        positions,
        geometry_field=NodeSnapshot.GEOFIELD,
        fields=NodeSnapshot.GEOJSON_FIELDS,
        use_natural_foreign_keys=True,
    )
    return HttpResponse(geojson_data, content_type="application/geo+json")


def node_interfaces(request, node_id):
    node = get_object_or_404(Node, pk=node_id)
    data = serializers.serialize("json", NodeInterface.objects.filter(node=node), use_natural_foreign_keys=True)
    return HttpResponse(data, content_type="application/json")


def node_addresses(request, node_id):
    node = get_object_or_404(Node, pk=node_id)
    data = serializers.serialize(
        "json", NodeAddress.objects.filter(node=node).order_by("address_layer"), use_natural_foreign_keys=True
    )
    return HttpResponse(data, content_type="application/json")


def node_snapshots(request, node_id):
    node = get_object_or_404(Node, pk=node_id)
    data = serializers.serialize(
        "json", NodeSnapshot.objects.filter(node=node).order_by("-captured_at"), use_natural_foreign_keys=True
    )
    return HttpResponse(data, content_type="application/json")


def node_latest_routes(request, node_id):
    node = get_object_or_404(Node, pk=node_id)
    try:
        snapshot = NodeSnapshot.objects.filter(node=node).order_by("-captured_at")[0]
    except IndexError:
        return HttpResponseNotFound("No snapshot")
    data = serializers.serialize("json", NodeRoute.objects.filter(snapshot=snapshot), use_natural_foreign_keys=True)
    return HttpResponse(data, content_type="application/json")


def node_latest_wireless(request, node_id):
    return HttpResponse("Wireless readings endpoint replaced by RadioReading — see [P1-23]", status=501)


def node_routes(request, node_id, snapshot_id):
    node = get_object_or_404(Node, pk=node_id)
    snapshot = get_object_or_404(NodeSnapshot, pk=snapshot_id, node=node)
    data = serializers.serialize("json", NodeRoute.objects.filter(snapshot=snapshot), use_natural_foreign_keys=True)
    return HttpResponse(data, content_type="application/json")


def node_wireless(request, node_id, snapshot_id):
    return HttpResponse("Wireless readings endpoint replaced by RadioReading — see [P1-23]", status=501)


def node_get_neighbour_views(request, node_id):
    return HttpResponse("Neighbour views endpoint replaced by RadioReading — see [P1-23]", status=501)


def standardize_address(address):
    if ":" in address:
        return address.lower()
    else:
        # Probably IPv4, doesn't matter
        return address


def node_upload(request, node_id):
    node = get_object_or_404(Node, pk=node_id)

    if request.method == "POST":
        data_file = request.FILES["data"]
        data = json.load(data_file)
    else:
        return HttpResponse("Unsupport Method")

    try:
        lon = float(data["longitude"])
        lat = float(data["latitude"])
        alt = float(data.get("altitude", 0))
        captured_at_raw = data.get("captured_at")
        if captured_at_raw is not None:
            captured_at = parse_datetime(str(captured_at_raw))
            if captured_at is None:
                return HttpResponse("Invalid captured_at: expected ISO 8601 datetime.", status=400)
        else:
            captured_at = timezone.now()

        snapshot = NodeSnapshot(
            node=node,
            captured_at=captured_at,
            position=Point(lon, lat, alt),
        )
        snapshot.save()
    except Exception as e:
        print(e)
        return HttpResponse("Unable to create snapshot")

    # Add any interfaces this node has
    if "interfaces" in data:
        for interface in data["interfaces"]:
            if "ifname" in interface:
                try:
                    known_interface = NodeInterface.objects.get(node=node, ifname=interface["ifname"])
                except ObjectDoesNotExist:
                    known_interface = NodeInterface(node=node, ifname=interface["ifname"])
                    known_interface.save()
            if "lladdress" in interface:
                try:
                    known_address = NodeAddress.objects.get(
                        node=node, address=standardize_address(interface["lladdress"])
                    )
                except ObjectDoesNotExist:
                    known_address = NodeAddress(
                        node=node, address=standardize_address(interface["lladdress"]), address_layer=2
                    )
                    known_address.save()

    # Add any addresses this node has
    if "addresses" in data:
        for address in data["addresses"]:
            try:
                known_address = NodeAddress.objects.get(node=node, address=standardize_address(address["address"]))
            except ObjectDoesNotExist:
                known_address = NodeAddress(node=node, address=standardize_address(address["address"]), address_layer=3)
                known_address.save()

    # Add any routes
    if "routes" in data:
        for route in data["routes"]:
            if "destination" in route and "nexthop" in route:
                try:
                    nexthop = NodeAddress.objects.get(address=standardize_address(route["nexthop"]))
                except ObjectDoesNotExist:
                    nexthop = None
                if nexthop is not None:
                    node_route = NodeRoute(snapshot=snapshot, destination=route["destination"], nexthop=nexthop)
                    node_route.save()

    return HttpResponse("Success")
