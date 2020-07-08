from django.urls import path

from . import views

urlpatterns = [
    path('', views.index, name='index'),
    path('nodes/list/', views.nodes_list, name='node_list'),
]
