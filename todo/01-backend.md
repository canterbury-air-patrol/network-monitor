# Phase 1: Backend API & WebSockets

1. [ ] **[P1-01]** Update `requirements.txt` with core backend dependencies: `djangorestframework`, `django-cors-headers`, `channels`, `daphne`.
2. [ ] **[P1-02]** Update `settings.py` with `REST_FRAMEWORK` and `CORS_ALLOWED_ORIGINS` configuration.
3. [ ] **[P1-03]** Configure `CHANNEL_LAYERS` in `settings.py`.
4. [ ] **[P1-04]** Set up `ASGI_APPLICATION` in `settings.py` and create `networkmonitor/asgi.py`.
5. [ ] **[P1-05]** Configure PostGIS-enabled test database in `settings.py` for `pytest`.
6. [ ] **[P1-06]** Create `data/serializers.py` for `Node`.
7. [ ] **[P1-07]** Create `data/serializers.py` for `NodeSnapshot`.
8. [ ] **[P1-08]** Create `data/serializers.py` for `NodeWirelessNeighbour`.
9. [ ] **[P1-09]** Implement DRF ViewSets in `data/api_views.py` for Nodes and Snapshots.
10. [ ] **[P1-10]** Implement WebSocket Consumers in `data/consumers.py`.
11. [ ] **[P1-11]** Define WebSocket routing in `data/routing.py` and `networkmonitor/routing.py`.
12. [ ] **[P1-12]** Write unit tests for `Node` Serializer using `factory-boy`.
13. [ ] **[P1-13]** Write unit tests for `NodeSnapshot` Serializer.
14. [ ] **[P1-14]** Write integration tests for Node API endpoints.
15. [ ] **[P1-15]** Write tests for WebSocket message broadcasting and channel group isolation.
