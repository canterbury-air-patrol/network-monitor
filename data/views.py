import json

from django.core import serializers
from django.core.exceptions import ObjectDoesNotExist
from django.http import HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.contrib.gis.geos import Point

from .models import Node, NodeSnapshot, NodeInterface, NodeAddress, NodeWirelessNeighbour, NodeRoute


def index(request):
    return HttpResponse("Hello, world. You're at the data index.")


def nodes_list(request):
    data = serializers.serialize('json', Node.objects.all())
    return HttpResponse(data, content_type='application/json')


def nodes_positions(request):
    nodes = Node.objects.all()
    positions = []
    for node in nodes:
        try:
            snapshot = NodeSnapshot.objects.filter(node=node).order_by('-timestamp')[0]
            positions.append(snapshot)
        except:
            pass
    geojson_data = serializers.serialize('geojson', positions, geometry_field=NodeSnapshot.GEOFIELD,
                             fields=NodeSnapshot.GEOJSON_FIELDS, use_natural_foreign_keys=True)
    return HttpResponse(geojson_data, content_type='application/geo+json')


def node_interfaces(request, node_id):
    node = get_object_or_404(Node, pk=node_id)
    data = serializers.serialize('json', NodeInterface.objects.filter(node=node), use_natural_foreign_keys=True)
    return HttpResponse(data, content_type='application/json')


def node_addresses(request, node_id):
    node = get_object_or_404(Node, pk=node_id)
    data = serializers.serialize('json', NodeAddress.objects.filter(node=node).order_by('address_layer'), use_natural_foreign_keys=True)
    return HttpResponse(data, content_type='application/json')


def node_snapshots(request, node_id):
    node = get_object_or_404(Node, pk=node_id)
    data = serializers.serialize('json', NodeSnapshot.objects.filter(node=node).order_by('-timestamp'), use_natural_foreign_keys=True)
    return HttpResponse(data, content_type='application/json')


def node_latest_routes(request, node_id):
    node = get_object_or_404(Node, pk=node_id)
    try:
        snapshot = NodeSnapshot.objects.filter(node=node).order_by('-timestamp')[0]
    except:
        return HttpResponseNotFound('No snapshot')
    data = serializers.serialize('json', NodeRoute.objects.filter(snapshot=snapshot), use_natural_foreign_keys=True)
    return HttpResponse(data, content_type='application/json')


def node_latest_wireless(request, node_id):
    node = get_object_or_404(Node, pk=node_id)
    try:
        snapshot = NodeSnapshot.objects.filter(node=node).order_by('-timestamp')[0]
    except:
        return HttpResponseNotFound('No snapshot')
    data = serializers.serialize('json', NodeWirelessNeighbour.objects.filter(snapshot=snapshot), use_natural_foreign_keys=True)
    return HttpResponse(data, content_type='application/json')


def node_routes(request, node_id, snapshot_id):
    node = get_object_or_404(Node, pk=node_id)
    snapshot = get_object_or_404(NodeSnapshot, pk=snapshot_id, node=node)
    data = serializers.serialize('json', NodeRoute.objects.filter(snapshot=snapshot), use_natural_foreign_keys=True)
    return HttpResponse(data, content_type='application/json')


def node_wireless(request, node_id, snapshot_id):
    node = get_object_or_404(Node, pk=node_id)
    snapshot = get_object_or_404(NodeSnapshot, pk=snapshot_id, node=node)
    data = serializers.serialize('json', NodeWirelessNeighbour.objects.filter(snapshot=snapshot), use_natural_foreign_keys=True)
    return HttpResponse(data, content_type='application/json')

def node_get_neighbour_views(request, node_id):
    node = get_object_or_404(Node, pk=node_id)
    data = NodeWirelessNeighbour.objects.filter(neighbour_address__node=node)
    results = []
    for wireless in data:
        results.append({'lat': wireless.snapshot.position[1], 'lng': wireless.snapshot.position[0], 'strength': wireless.signal_strength})
    return JsonResponse({'views': results})


def standardize_address(address):
    if ':' in address:
        return address.lower()
    else:
        # Probably IPv4, doesn't matter
        return address


def node_upload(request, node_id):
    node = get_object_or_404(Node, pk=node_id)

    if request.method == "POST":
        data_file = request.FILES['data']
        data = json.load(data_file)
    else:
        return HttpResponse('Unsupport Method')

    try:
        lon = float(data['longitude'])
        lat = float(data['latitude'])

        snapshot = NodeSnapshot(node=node, timestamp=timezone.now(), position=Point(lon, lat))
        snapshot.save()
    except:
        print(e)
        return HttpResponse('Unable to create snapshot')

    # Add any interfaces this node has
    if 'interfaces' in data:
        for interface in data['interfaces']:
            if 'ifname' in interface:
                try:
                    known_interface = NodeInterface.objects.get(node=node, ifname=interface['ifname'])
                except ObjectDoesNotExist:
                    known_interface = NodeInterface(node=node, ifname=interface['ifname'])
                    known_interface.save()
            if 'lladdress' in interface:
                try:
                    known_address = NodeAddress.objects.get(node=node, address=standardize_address(interface['lladdress']))
                except ObjectDoesNotExist:
                    known_address = NodeAddress(node=node, address=standardize_address(interface['lladdress']), address_layer=2)
                    known_address.save()

    # Add any addresses this node has
    if 'addresses' in data:
        for address in data['addresses']:
            try:
                known_address = NodeAddress.objects.get(node=node, address=standardize_address(address['address']))
            except ObjectDoesNotExist:
                known_address = NodeAddress(node=node, address=standardize_address(address['address']), address_layer=3)
                known_address.save()

    # Add any routes
    if 'routes' in data:
        for route in data['routes']:
            if 'destination' in route and 'nexthop' in route:
                try:
                    nexthop = NodeAddress.objects.get(address=standardize_address(route['nexthop']))
                except ObjectDoesNotExist:
                    nexthop = None
                if nexthop is not None:
                    route = NodeRoute(snapshot=snapshot, destination=destination, nexthop=nexthop)
                    route.save()

    # Add any wireless neighbours
    if 'wirelessneighbours' in data:
        for neighbour in data['wirelessneighbours']:
            if 'address' in neighbour and 'strength' in neighbour and 'ifname' in neighbour:
                try:
                    interface = NodeInterface.objects.get(node=node, ifname=neighbour['ifname'])
                except ObjectDoesNotExist:
                    interface = None
                try:
                    other_if = NodeAddress.objects.get(address=standardize_address(neighbour['address']))
                except ObjectDoesNotExist:
                    other_if = None
                if other_if is not None and interface is not None:
                    wirelessneighbour = NodeWirelessNeighbour(snapshot=snapshot, interface=interface, neighbour_address=other_if, signal_strength=neighbour['strength'])
                    wirelessneighbour.save()

    return HttpResponse("Success")