from django.urls import path, re_path

from . import views

urlpatterns = [
    path('', views.index, name='index'),
    path('nodes/list/', views.nodes_list, name='node_list'),
    path('nodes/position/latest/', views.nodes_positions, name='node_position'),
    re_path(r'^nodes/(?P<node_id>\d+)/upload/$', views.node_upload, name='node_upload'),
    re_path(r'^nodes/(?P<node_id>\d+)/interfaces/list/$', views.node_interfaces, name='node_interface'),
    re_path(r'^nodes/(?P<node_id>\d+)/addresses/list/$', views.node_addresses, name='node_addresses'),
    re_path(r'^nodes/(?P<node_id>\d+)/snapshots/list/$', views.node_snapshots, name='node_snapshots'),
    re_path(r'^nodes/(?P<node_id>\d+)/snapshots/latest/routes/list/$', views.node_latest_routes, name='node_latest_routes'),
    re_path(r'^nodes/(?P<node_id>\d+)/snapshots/latest/wireless/list/$', views.node_latest_wireless, name='node_latest_wireless'),
    re_path(r'^nodes/(?P<node_id>\d+)/snapshots/(?P<snapshot_id>\d+)/routes/list/$', views.node_routes, name='node_routes'),
    re_path(r'^nodes/(?P<node_id>\d+)/snapshots/(?P<snapshot_id>\d+)/wireless/list/$', views.node_wireless, name='node_wireless'),
    re_path(r'^nodes/(?P<node_id>\d+)/wireless/neighbours/opinion/list/$', views.node_get_neighbour_views, name='node_get_wireless_views'),
]
