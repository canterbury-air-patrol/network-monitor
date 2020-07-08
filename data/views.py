from django.core import serializers
from django.http import HttpResponse, JsonResponse

from .models import Node


def index(request):
    return HttpResponse("Hello, world. You're at the data index.")


def nodes_list(request):
    data = serializers.serialize('json', Node.objects.all())
    return HttpResponse(data, content_type='application/json')