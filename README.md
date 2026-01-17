# Flight Finder

A web application that uses your location to show flights within a 100-mile radius in real-time.

## Features

- Real-time flight tracking using your geolocation
- Shows all flights within 100 miles of your current position
- Displays flight information including:
  - Callsign
  - Origin country
  - Altitude
  - Speed
  - Heading
  - Vertical rate (climbing/descending/level)
  - Distance from your location
- Clean, responsive design that works on desktop and mobile
- Hosted on GitLab Pages

## How to Use

1. Visit the hosted page (will be available after deployment)
2. Click "Find Flights Near Me"
3. Allow location access when prompted
4. View all flights within 100 miles of your location

## Technology Stack

- HTML5 (Geolocation API)
- CSS3 (Modern gradient design)
- Vanilla JavaScript
- OpenSky Network API for real-time flight data

## Local Development

Simply open `index.html` in a web browser. Note that geolocation requires HTTPS in production, but works with `file://` protocol for local testing.

## Deployment

This project is configured for GitLab Pages. The `.gitlab-ci.yml` file handles automatic deployment to GitLab Pages when changes are pushed to the main branch.

## API Credits

Flight data is provided by the [OpenSky Network](https://opensky-network.org/), a non-profit association that provides free air traffic data.

## Privacy

Your location is only used locally in your browser to calculate distances. No location data is sent to any server except the OpenSky Network API, which receives a bounding box (not your exact location) to filter flight data.