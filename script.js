const canvas = document.getElementById('simulationCanvas');
const ctx = canvas.getContext('2d');

const CANVAS_WIDTH = canvas.width;
const CANVAS_HEIGHT = canvas.height;

// Define lane properties
const ROAD_HEIGHT = 400; // Height of the road (vertical size)
const LANE_COUNT = 4;
const LANE_HEIGHT = ROAD_HEIGHT / LANE_COUNT;
const GRASS_HEIGHT = (CANVAS_HEIGHT - ROAD_HEIGHT) / 2;

// Padding to keep cars away from lane separators
const LANE_PADDING = 10;

// World coordinates
let world = {
    lanes: LANE_COUNT,
    roadHeight: ROAD_HEIGHT,
};

// Utility Function to get lane center (y-coordinate)
function getLaneCenter(laneIndex) {
    return GRASS_HEIGHT + LANE_HEIGHT / 2 + laneIndex * LANE_HEIGHT;
}

// Utility Function to generate random colors for obstacle cars
function getRandomColor() {
    const colors = ['red', 'green', 'orange', 'purple', 'yellow'];
    return colors[Math.floor(Math.random() * colors.length)];
}

// Utility Function to calculate distance between two points
function distance(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.hypot(dx, dy);
}

// Function to get line intersection
function getLineIntersection(x1, y1, x2, y2, x3, y3, x4, y4) {
    // Line AB represented as a1x + b1y = c1
    const a1 = y2 - y1;
    const b1 = x1 - x2;
    const c1 = a1 * x1 + b1 * y1;

    // Line CD represented as a2x + b2y = c2
    const a2 = y4 - y3;
    const b2 = x3 - x4;
    const c2 = a2 * x3 + b2 * y3;

    const determinant = a1 * b2 - a2 * b1;

    if (determinant === 0) {
        return null; // Lines are parallel
    } else {
        const x = (b2 * c1 - b1 * c2) / determinant;
        const y = (a1 * c2 - a2 * c1) / determinant;

        // Check if the intersection point is on both line segments
        if (
            x >= Math.min(x1, x2) &&
            x <= Math.max(x1, x2) &&
            x >= Math.min(x3, x4) &&
            x <= Math.max(x3, x4) &&
            y >= Math.min(y1, y2) &&
            y <= Math.max(y1, y2) &&
            y >= Math.min(y3, y4) &&
            y <= Math.max(y3, y4)
        ) {
            return { x, y };
        } else {
            return null;
        }
    }
}

// Car Class
class Car {
    constructor(x, y, width, height, color, isPlayer = false) {
        this.x = x; // World x
        this.y = y; // World y
        this.width = width;
        this.height = height;
        this.color = color;
        this.speed = 0;
        this.maxSpeed = isPlayer ? 4 : 2; // Player can have higher speed
        this.acceleration = 0.2;
        this.friction = 0.05;
        this.angle = 0; // Degrees (0 means facing right)
        this.isPlayer = isPlayer;
        this.currentLane = this.getLaneIndex(this.y); // Start in the current lane
        this.targetLane = this.currentLane;
        this.sensors = new Sensors(this);
        this.state = 'driving'; // Possible states: driving, stopped
    }

    getLaneIndex(y) {
        return Math.floor((y - GRASS_HEIGHT) / LANE_HEIGHT);
    }

    update(traffic, obstacles) {
        if (this.isPlayer) {
            this.sensors.update(traffic, obstacles);
            this.decideMovement(traffic, obstacles);
            this.move();
        } else {
            // Simple AI for other cars: move towards the player
            this.moveTowardsPlayer();
        }
    }

    decideMovement(traffic, obstacles) {
        let needToStop = false;
        let obstacleAhead = false;
        let closestObstacleDistance = Infinity;
        let closestTrafficLight = null;

        // Analyze sensor data
        this.sensors.detected.forEach(det => {
            if (det.type === 'obstacle') {
                // Check if obstacle is in the same lane and ahead
                const laneDifference = Math.abs(this.getLaneIndex(this.y) - this.getLaneIndex(det.y));
                if (laneDifference === 0 && det.x > this.x) {
                    obstacleAhead = true;
                    if (distance(this.x, this.y, det.x, det.y) < closestObstacleDistance) {
                        closestObstacleDistance = distance(this.x, this.y, det.x, det.y);
                    }
                }
            }

            if (det.type === 'traffic') {
                // Check if traffic light is in the same lane and ahead
                const laneDifference = Math.abs(this.getLaneIndex(this.y) - this.getLaneIndex(det.y));
                if (laneDifference === 0 && det.x > this.x) {
                    if (det.state === 'red') {
                        needToStop = true;
                        closestTrafficLight = det;
                    }
                }
            }
        });

        if (needToStop) {
            this.state = 'stopped';
            // Calculate stopping distance based on current speed
            const stoppingDistance = (this.speed * this.speed) / (2 * this.acceleration);
            if (distance(this.x, this.y, closestTrafficLight.x, closestTrafficLight.y) <= stoppingDistance + 20) {
                // Stop completely
                this.speed = Math.max(this.speed - this.acceleration, 0);
            }
        } else if (obstacleAhead) {
            // Try to change lane if possible
            this.state = 'driving';
            // Attempt to change to left lane first
            if (this.currentLane > 0 && this.isLaneFree(this.currentLane - 1, traffic, obstacles)) {
                this.targetLane = this.currentLane - 1;
            }
            // If left lane isn't free, try to change to right lane
            else if (this.currentLane < LANE_COUNT - 1 && this.isLaneFree(this.currentLane + 1, traffic, obstacles)) {
                this.targetLane = this.currentLane + 1;
            }
            // If no lane change possible, slow down
            else {
                this.speed = Math.max(this.speed - this.acceleration, 0);
            }
        } else {
            // No obstacle, maintain or increase speed
            this.state = 'driving';
            if (this.speed < this.maxSpeed) {
                this.speed += this.acceleration;
            }
            this.targetLane = this.currentLane;
        }

        // Smoothly change lanes
        if (this.targetLane !== this.currentLane) {
            const laneCenterY = getLaneCenter(this.targetLane);
            const delta = laneCenterY - this.y;
            if (Math.abs(delta) > 1) {
                this.y += delta * 0.05; // Smooth transition
            } else {
                this.y = laneCenterY;
                this.currentLane = this.targetLane;
            }
        }
    }

    isLaneFree(targetLane, traffic, obstacles) {
        // Check if the target lane is free of obstacles within a certain distance
        for (let car of obstacles) {
            const laneDifference = Math.abs(this.getLaneIndex(this.y) - this.getLaneIndex(car.y));
            if (laneDifference === 0 && Math.abs(car.x - this.x) < 150) { // Increased buffer
                return false;
            }
        }

        // Check if there is a red traffic light in the target lane ahead
        for (let tl of traffic) {
            const laneDifference = Math.abs(this.getLaneIndex(this.y) - this.getLaneIndex(tl.y));
            if (laneDifference === 0 && tl.state === 'red' && Math.abs(tl.x - this.x) < 500) { // Increased distance
                return false;
            }
        }

        return true;
    }

    move() {
        if (this.state === 'driving') {
            this.speed = Math.min(this.speed + this.acceleration, this.maxSpeed);
        } else if (this.state === 'stopped') {
            this.speed = Math.max(this.speed - this.acceleration, 0);
        }

        // Update position based on speed along x-axis
        this.x += this.speed;
    }

    moveTowardsPlayer() {
        // Simple AI: other cars move towards the player (left)
        this.x -= this.speed;
    }

    resetPosition() {
        // Reset to the right side of the road with increased spacing
        this.x = camera.x + CANVAS_WIDTH / 2 + this.width + Math.random() * CANVAS_WIDTH * 3;
        // Assign a random lane
        this.currentLane = Math.floor(Math.random() * LANE_COUNT);
        this.targetLane = this.currentLane;
        // Center the car within the lane with padding
        this.y = getLaneCenter(this.currentLane);
        this.speed = 2 + Math.random() * 2;
        this.state = 'driving';
    }

    draw() {
        // Translate world coordinates to camera view
        const screenX = this.x - camera.x + CANVAS_WIDTH / 2 - this.width / 2;
        const screenY = this.y - camera.y + CANVAS_HEIGHT / 2 - this.height / 2;

        ctx.save();
        ctx.translate(screenX + this.width / 2, screenY + this.height / 2);
        ctx.rotate((this.angle * Math.PI) / 180);
        ctx.fillStyle = this.color;
        ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);
        ctx.restore();

        // Draw sensors if player
        if (this.isPlayer) {
            this.sensors.draw();
        }
    }
}

// Sensors Class
class Sensors {
    constructor(car) {
        this.car = car;
        this.rayCount = 36; // Increased to cover more directions
        this.rayLength = 500; // Increased length
        this.raySpread = 180; // Focused towards the front (90 degrees on each side)
        this.rays = [];
        this.detected = [];
    }

    update(traffic, obstacles) {
        this.rays = [];
        this.detected = [];
        const startAngle = -this.raySpread / 2 ; // Adjusted to focus more on front
        const endAngle = this.raySpread / 2 ;
        const step = this.raySpread / (this.rayCount - 1);

        for (let i = 0; i < this.rayCount; i++) {
            const angle = this.car.angle + startAngle + step * i;
            const ray = this.castRay(angle, traffic, obstacles);
            this.rays.push(ray);
        }
    }

    castRay(angle, traffic, obstacles) {
        // Convert angle to radians
        const rad = (angle * Math.PI) / 180;
        const sin = Math.sin(rad);
        const cos = Math.cos(rad);

        // Define ray end point
        const endX = this.car.x + this.rayLength * cos;
        const endY = this.car.y + this.rayLength * sin;

        // Check intersections with traffic lights
        let closest = null;
        let minDist = Infinity;

        // Check traffic lights
        traffic.forEach((tl) => {
            const intersection = tl.getIntersection(this.car.x, this.car.y, endX, endY);
            if (intersection) {
                const dist = distance(this.car.x, this.car.y, intersection.x, intersection.y);
                if (dist < minDist) {
                    minDist = dist;
                    closest = { x: intersection.x, y: intersection.y, type: 'traffic', state: tl.state };
                }
            }
        });

        // Check obstacles
        obstacles.forEach((ob) => {
            const intersection = ob.getIntersection(this.car.x, this.car.y, endX, endY);
            if (intersection) {
                const dist = distance(this.car.x, this.car.y, intersection.x, intersection.y);
                if (dist < minDist) {
                    minDist = dist;
                    closest = { x: intersection.x, y: intersection.y, type: 'obstacle' };
                }
            }
        });

        if (closest) {
            this.detected.push(closest);
            return { x: closest.x, y: closest.y, type: closest.type, state: closest.state || null };
        } else {
            return { x: endX, y: endY, type: null, state: null };
        }
    }

    draw() {
        this.rays.forEach((ray, index) => {
            const screenStartX = this.car.x - camera.x + CANVAS_WIDTH / 2;
            const screenStartY = this.car.y - camera.y + CANVAS_HEIGHT / 2;

            const screenEndX = ray.x - camera.x + CANVAS_WIDTH / 2;
            const screenEndY = ray.y - camera.y + CANVAS_HEIGHT / 2;

            ctx.beginPath();
            ctx.moveTo(screenStartX, screenStartY);
            ctx.lineTo(screenEndX, screenEndY);
            ctx.strokeStyle = 'rgba(255,0,0,0.2)'; // More transparent for better visibility
            ctx.lineWidth = 1;
            ctx.stroke();

            // Draw intersection point
            if (ray.type && distance(this.car.x, this.car.y, ray.x, ray.y) < this.rayLength) {
                ctx.beginPath();
                ctx.arc(screenEndX, screenEndY, 5, 0, Math.PI * 2);
                ctx.fillStyle = ray.type === 'traffic' ? 'yellow' : 'blue';
                ctx.fill();
            }
        });
    }
}

// Obstacle (Other Cars) Class
class ObstacleCar {
    constructor(x, y, width, height, color, speed = 2) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.color = color;
        this.speed = speed;
    }

    update() {
        this.x -= this.speed;
        if (this.x < camera.x - CANVAS_WIDTH / 2 - this.width) {
            this.resetPosition();
        }
    }

    resetPosition() {
        // Reset to the right side of the road with increased spacing
        this.x = camera.x + CANVAS_WIDTH / 2 + this.width + Math.random() * CANVAS_WIDTH * 3;
        // Assign a random lane
        this.currentLane = Math.floor(Math.random() * LANE_COUNT);
        this.targetLane = this.currentLane;
        // Center the car within the lane with padding
        this.y = getLaneCenter(this.currentLane);
        this.speed = 2 + Math.random() * 2;
        this.state = 'driving';
    }

    draw() {
        const screenX = this.x - camera.x + CANVAS_WIDTH / 2 - this.width / 2;
        const screenY = this.y - camera.y + CANVAS_HEIGHT / 2 - this.height / 2;

        ctx.save();
        ctx.fillStyle = this.color;
        ctx.fillRect(screenX, screenY, this.width, this.height);
        ctx.restore();
    }

    // Rectangle intersection
    getIntersection(rayStartX, rayStartY, rayEndX, rayEndY) {
        // Define rectangle sides
        const lines = [
            {
                x1: this.x - this.width / 2,
                y1: this.y - this.height / 2,
                x2: this.x + this.width / 2,
                y2: this.y - this.height / 2,
            },
            {
                x1: this.x + this.width / 2,
                y1: this.y - this.height / 2,
                x2: this.x + this.width / 2,
                y2: this.y + this.height / 2,
            },
            {
                x1: this.x + this.width / 2,
                y1: this.y + this.height / 2,
                x2: this.x - this.width / 2,
                y2: this.y + this.height / 2,
            },
            {
                x1: this.x - this.width / 2,
                y1: this.y + this.height / 2,
                x2: this.x - this.width / 2,
                y2: this.y - this.height / 2,
            },
        ];

        for (let line of lines) {
            const intersection = getLineIntersection(
                rayStartX,
                rayStartY,
                rayEndX,
                rayEndY,
                line.x1,
                line.y1,
                line.x2,
                line.y2
            );
            if (intersection) {
                return intersection;
            }
        }
        return null;
    }
}

// Traffic Light Class
class TrafficLight {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.states = ['green', 'yellow', 'red'];
        this.currentStateIndex = 0;
        this.state = this.states[this.currentStateIndex];
        this.timer = 0;
        this.durations = [15000, 5000, 15000]; // Increased durations for green and red
    }

    update(deltaTime) {
        this.timer += deltaTime;
        if (this.timer > this.durations[this.currentStateIndex]) {
            this.timer = 0;
            this.currentStateIndex = (this.currentStateIndex + 1) % this.states.length;
            this.state = this.states[this.currentStateIndex];
        }
    }

    draw() {
        const screenX = this.x - camera.x + CANVAS_WIDTH / 2;
        const screenY = this.y - camera.y + CANVAS_HEIGHT / 2;

        // Draw pole
        ctx.fillStyle = 'black';
        ctx.fillRect(screenX, screenY, 10, 30);

        // Draw light (circle)
        ctx.beginPath();
        ctx.arc(screenX + 5, screenY, 5, 0, Math.PI * 2);
        ctx.fillStyle = this.state;
        ctx.fill();
    }

    // Circle intersection
    getIntersection(rayStartX, rayStartY, rayEndX, rayEndY) {
        // Traffic light treated as a small circle
        const lightRadius = 5;
        const dx = rayEndX - rayStartX;
        const dy = rayEndY - rayStartY;
        const fx = rayStartX - this.x;
        const fy = rayStartY - this.y;

        const a = dx * dx + dy * dy;
        const b = 2 * (fx * dx + fy * dy);
        const c = (fx * fx + fy * fy) - lightRadius * lightRadius;

        let discriminant = b * b - 4 * a * c;

        if (discriminant < 0) {
            // No intersection
            return null;
        }

        discriminant = Math.sqrt(discriminant);

        let t1 = (-b - discriminant) / (2 * a);
        let t2 = (-b + discriminant) / (2 * a);

        if (t1 >= 0 && t1 <= 1) {
            return { x: rayStartX + t1 * dx, y: rayStartY + t1 * dy };
        }

        if (t2 >= 0 && t2 <= 1) {
            return { x: rayStartX + t2 * dx, y: rayStartY + t2 * dy };
        }

        return null;
    }
}

// Sensors Class needs to know rayLength for TrafficLight intersection
Sensors.prototype.rayLength = 500;

// Initialize Roads
function initRoads() {
    // Roads are infinite horizontally, so no initialization needed
}

// Draw Roads
function drawRoads() {
    // Draw grass
    ctx.fillStyle = '#7ec850'; // Grass color
    ctx.fillRect(0, 0, CANVAS_WIDTH, GRASS_HEIGHT);
    ctx.fillRect(0, GRASS_HEIGHT + ROAD_HEIGHT, CANVAS_WIDTH, GRASS_HEIGHT);

    // Draw road
    ctx.fillStyle = '#555'; // Road color
    ctx.fillRect(0, GRASS_HEIGHT, CANVAS_WIDTH, ROAD_HEIGHT);

    // Draw lane markings
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.setLineDash([20, 20]);

    for (let i = 1; i < LANE_COUNT; i++) {
        const y = GRASS_HEIGHT + i * LANE_HEIGHT;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(CANVAS_WIDTH, y);
        ctx.stroke();
    }

    ctx.setLineDash([]); // Reset dash
}

// Initialize Players and Obstacles
let playerCar;
let obstacleCarsList = [];
let trafficLightsList = [];

function initEntities() {
    // Player starts at the left center of the road with lane padding
    playerCar = new Car(
        camera.x - CANVAS_WIDTH / 2 + 100, // Start slightly inside the canvas
        getLaneCenter(Math.floor(LANE_COUNT / 2)),
        40,
        20,
        'blue',
        true
    );

    // Add some obstacle cars
    for (let i = 0; i < 8; i++) { // Increased number of obstacle cars for higher traffic density
        const lane = Math.floor(Math.random() * LANE_COUNT);
        const x = camera.x + CANVAS_WIDTH / 2 + Math.random() * CANVAS_WIDTH * 3;
        const y = getLaneCenter(lane);
        const color = getRandomColor();
        const speed = 2 + Math.random() * 2;
        obstacleCarsList.push(new ObstacleCar(x, y, 40, 20, color, speed));
    }

    // Add traffic lights at specific positions with increased spacing
    for (let i = 0; i < LANE_COUNT; i++) {
        // Position traffic lights ahead of the player with more spacing
        const x = camera.x + CANVAS_WIDTH / 2 + 1500 + i * 1800; // Further spacing between traffic lights
        const y = getLaneCenter(i);
        trafficLightsList.push(createTrafficLight(x, y));
    }
}

function createTrafficLight(x, y) {
    return new TrafficLight(x, y);
}

// Update Entities
function updateEntities(deltaTime) {
    // Update traffic lights
    trafficLightsList.forEach((tl) => tl.update(deltaTime));

    // Update player car
    playerCar.update(trafficLightsList, obstacleCarsList);

    // Update obstacle cars
    obstacleCarsList.forEach((car) => car.update());

    // Remove and add traffic lights to keep them ahead with increased spacing
    trafficLightsList = trafficLightsList.filter(tl => tl.x > camera.x - CANVAS_WIDTH);
    while (trafficLightsList.length < LANE_COUNT * 3) { // Maintains spacing by keeping three traffic lights per lane ahead
        const lane = Math.floor(Math.random() * LANE_COUNT);
        const lastTrafficLight = trafficLightsList[trafficLightsList.length - 1];
        const x = lastTrafficLight ? lastTrafficLight.x + 1800 + Math.random() * 600 : camera.x + CANVAS_WIDTH / 2 + 1500 + Math.random() * 1800;
        const y = getLaneCenter(lane);
        trafficLightsList.push(createTrafficLight(x, y));
    }

    // Reset obstacle cars if out of bounds
    obstacleCarsList.forEach((car) => {
        if (car.x < camera.x - CANVAS_WIDTH / 2 - car.width) {
            car.resetPosition();
        }
    });

    // Update camera to follow the player's car along the x-axis
    camera.x = playerCar.x;
    // Keep camera.y fixed to center lanes to prevent vertical movement
    camera.y = getLaneCenter(Math.floor(LANE_COUNT / 2));
}

// Draw Entities
function drawEntities() {
    // Draw traffic lights
    trafficLightsList.forEach((tl) => tl.draw());

    // Draw obstacle cars
    obstacleCarsList.forEach((car) => car.draw());

    // Draw player car on top
    playerCar.draw();
}

// Camera to keep the player car centered
let camera = {
    x: 0,
    y: getLaneCenter(Math.floor(LANE_COUNT / 2)),
};

// Main Animation Loop
let lastTime = 0;
function animate(time) {
    const deltaTime = time - lastTime;
    lastTime = time;

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    drawRoads();
    updateEntities(deltaTime);
    drawEntities();

    requestAnimationFrame(animate);
}

// Initialize Simulation
initRoads();
initEntities();
requestAnimationFrame(animate);