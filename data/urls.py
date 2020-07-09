from django.urls import path
from django.conf.urls import url

from . import views

urlpatterns = [
    path('', views.index, name='index'),
    path('nodes/list/', views.nodes_list, name='node_list'),
    url(r'^nodes/(?P<node_id>\d+)/upload/$', views.node_upload, name='node_upload'),
]
