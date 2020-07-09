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

        snapshot = NodeSnapshot(node=node, timestamp=timezone.now(), position=Point(lat, lon))
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
                    known_address = NodeAddress.objects.get(node=node, address=interface['lladdress'])
                except ObjectDoesNotExist:
                    known_address = NodeAddress(node=node, address=interface['lladdress'], address_layer=2)
                    known_address.save()

    # Add any addresses this node has
    if 'addresses' in data:
        for address in data['addresses']:
            try:
                known_address = NodeAddress.objects.get(node=node, address=address['address'])
            except ObjectDoesNotExist:
                known_address = NodeAddress(node=node, address=address['address'], address_layer=3)
                known_address.save()

    # Add any routes
    if 'routes' in data:
        for route in data['routes']:
            if 'destination' in route and 'nexthop' in route:
                try:
                    nexthop = NodeAddress.objects.get(address=route['nexthop'])
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
                    other_if = NodeAddress.objects.get(address=neighbour['address'])
                except ObjectDoesNotExist:
                    other_if = None
                if other_if is not None and interface is not None:
                    wirelessneighbour = NodeWirelessNeighbour(snapshot=snapshot, interface=interface, neighbour_address=other_if, signal_strength=neighbour[strength])
                    wirelessneighbour.save()

    return HttpResponse("Success")