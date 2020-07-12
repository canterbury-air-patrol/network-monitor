from django.urls import path
from django.conf.urls import url

from . import views

urlpatterns = [
    path('', views.index, name='index'),
    path('nodes/list/', views.nodes_list, name='node_list'),
    path('nodes/position/latest/', views.nodes_positions, name='node_position'),
    url(r'^nodes/(?P<node_id>\d+)/upload/$', views.node_upload, name='node_upload'),
    url(r'^nodes/(?P<node_id>\d+)/interfaces/list/$', views.node_interfaces, name='node_interface'),
    url(r'^nodes/(?P<node_id>\d+)/addresses/list/$', views.node_addresses, name='node_addresses'),
    url(r'^nodes/(?P<node_id>\d+)/snapshots/list/$', views.node_snapshots, name='node_snapshots'),
    url(r'^nodes/(?P<node_id>\d+)/snapshots/latest/routes/list/$', views.node_latest_routes, name='node_latest_routes'),
    url(r'^nodes/(?P<node_id>\d+)/snapshots/latest/wireless/list/$', views.node_latest_wireless, name='node_latest_wireless'),
    url(r'^nodes/(?P<node_id>\d+)/snapshots/(?P<snapshot_id>\d+)/routes/list/$', views.node_routes, name='node_routes'),
    url(r'^nodes/(?P<node_id>\d+)/snapshots/(?P<snapshot_id>\d+)/wireless/list/$', views.node_wireless, name='node_wireless'),
]
