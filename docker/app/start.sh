#!/bin/bash

./setup.sh
./manage.py migrate
./manage.py runserver 0.0.0.0:8050
