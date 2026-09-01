# 📋 PHASE 2 - APK Implementation Checklist

**Document Version:** 1.0  
**Date:** April 28, 2026  
**Duration:** 7 weeks (Weeks 1-7)  
**Target:** Production-ready APK v2.0.0

---

## WEEK 1: Project Foundation & Setup

### Infrastructure Setup
- [ ] Android Studio project created with latest Gradle
- [ ] Version Control: GitHub repository initialized
- [ ] CI/CD Pipeline: GitHub Actions configured
  - [ ] Automated builds on every push
  - [ ] Unit tests run on PR
  - [ ] Code coverage reports generated
- [ ] Dependency Management:
  - [ ] CameraX (androidx.camera:camera-core, -camera2, -lifecycle)
  - [ ] ML Kit Face Detection (com.google.mlkit:face-detection)
  - [ ] TensorFlow Lite (org.tensorflow:tensorflow-lite, -gpu)
  - [ ] Room Database (androidx.room:room-runtime, -compiler)
  - [ ] SQLCipher (net.zetetic:android-database-sqlcipher)
  - [ ] OkHttp (com.squareup.okhttp3:okhttp, -logging-interceptor)
  - [ ] Retrofit (com.squareup.retrofit2:retrofit, -converter-gson)
  - [ ] Coroutines (org.jetbrains.kotlinx:kotlinx-coroutines-android)
  - [ ] Data Store (androidx.datastore:datastore-preferences)
  - [ ] Android Security (androidx.security:security-crypto)
  - [ ] Material Components (com.google.android.material:material)
- [ ] Kotlin Configuration
  - [ ] Language version: 1.8+
  - [ ] JVM target: 11
  - [ ] Coroutines plugin enabled
- [ ] ProGuard/R8 configuration
  - [ ] Obfuscation rules for TensorFlow Lite
  - [ ] Keep classes for Room entities
  - [ ] Keep API classes
- [ ] Build Variants
  - [ ] Debug build (with logging)
  - [ ] Release build (obfuscated, optimized)
  - [ ] QA build (analytics enabled)

### Database Schema
- [ ] Create Room database schema
  - [ ] Employees table
  - [ ] Attendance table
  - [ ] FaceEncoding table
  - [ ] ReferenceImage table
  - [ ] SyncQueue table
  - [ ] AuditLog table
- [ ] Database Encryption
  - [ ] SQLCipher integration working
  - [ ] Encryption key generation (Android Keystore)
  - [ ] Database migration v1 → v2 tested
- [ ] DAOs Created
  - [ ] EmployeeDao (CRUD + queries)
  - [ ] AttendanceDao (CRUD + queries by date)
  - [ ] FaceEncodingDao (CRUD + embeddings)
  - [ ] ReferenceImageDao (CRUD)
  - [ ] SyncQueueDao (pending syncs)
- [ ] Migrations
  - [ ] Migration script v1_2.sql created
  - [ ] Backward compatibility tested
- [ ] Database Tests
  - [ ] All DAOs have unit tests
  - [ ] Encryption/decryption tested

### Project Structure & Architecture
- [ ] MVVM Architecture setup
  - [ ] ViewModel base classes
  - [ ] Repository pattern implemented
  - [ ] Dependency injection (Hilt) configured
- [ ] Directories created:
  - [ ] `ui/staff/` → Staff UI screens
  - [ ] `ui/admin/` → Admin UI screens
  - [ ] `ui/common/` → Shared UI components
  - [ ] `facerecognition/` → Face recognition modules
  - [ ] `network/` → API clients
  - [ ] `security/` → Encryption/key management
  - [ ] `database/` → Room entities & DAOs
  - [ ] `utils/` → Helper functions
  - [ ] `di/` → Dependency injection modules
- [ ] Constants file created with:
  - [ ] API endpoints
  - [ ] Thresholds (similarity, confidence)
  - [ ] Timeouts (network, camera)
  - [ ] UI strings

### Documentation
- [ ] README.md created (build instructions)
- [ ] ARCHITECTURE.md created
- [ ] Setup guide started
- [ ] Technology stack document created

### Testing Framework
- [ ] JUnit 4 configured
- [ ] Espresso for UI testing configured
- [ ] Mockito for unit mocking configured
- [ ] Test data builders created
- [ ] Mock services for EDGE API created

---

## WEEK 2: Core Face Recognition Engine

### Camera Module
- [ ] CameraX integration
  - [ ] CameraProvider lifecycle management
  - [ ] Preview use case working
  - [ ] Image analysis use case for frame capture
  - [ ] Camera permissions requested/handled
  - [ ] Camera selector (front/rear, lens facing)
  - [ ] Focus/exposure management
- [ ] Camera Preview UI
  - [ ] PreviewView component working
  - [ ] Frame rate configurable (15/30 fps)
  - [ ] Rotation handling for device orientation
  - [ ] Torch/flash control (optional)
- [ ] Camera Utilities
  - [ ] Frame format conversion (NV21 → RGB)
  - [ ] Image cropping to face region
  - [ ] Resolution resizing (224×224 for detection, 112×112 for embedding)
  - [ ] Brightness normalization
- [ ] Camera Tests
  - [ ] Unit tests for frame processing
  - [ ] Integration test: camera → detection on emulator
  - [ ] Performance test: frame capture rate

### ML Kit Face Detection
- [ ] ML Kit Face Detector initialization
  - [ ] Detector options configured (real-time mode)
  - [ ] Performance mode: ACCURATE
  - [ ] Landmark detection enabled
  - [ ] Classification enabled (eye-open, smile)
- [ ] Face Detection Processing
  - [ ] Detect faces in frame
  - [ ] Extract bounding box
  - [ ] Extract facial landmarks (33 points)
  - [ ] Calculate face size/distance
  - [ ] Confidence score calculation
- [ ] Face Validation
  - [ ] Face too small? (<50x50 pixels)
  - [ ] Face too large? (>400x400 pixels)
  - [ ] Multiple faces detected? (reject or select largest)
  - [ ] Face rotation > 45°? (reject)
  - [ ] Minimum landmarks detected? (all 33 present)
- [ ] ML Kit Tests
  - [ ] Unit tests: bounding box calculation
  - [ ] Integration test: detect on sample images
  - [ ] Performance test: detection time <50ms

### Face Alignment & Cropping
- [ ] Alignment Algorithm
  - [ ] Extract eye centers from landmarks
  - [ ] Calculate eye midpoint
  - [ ] Rotate face to horizontal (align eyes)
  - [ ] Crop to 112×112 centered on nose
  - [ ] Resize to model input dimensions
- [ ] Preprocessing Pipeline
  - [ ] Histogram equalization (optional)
  - [ ] Contrast normalization
  - [ ] Blur detection (if > threshold, request re-capture)
  - [ ] Brightness check (if too dark/bright, guide user)
- [ ] Alignment Tests
  - [ ] Unit tests: rotation matrix calculation
  - [ ] Visual tests: aligned images look correct
  - [ ] Performance test: alignment <20ms

### TensorFlow Lite Model Integration
- [ ] Model Loading
  - [ ] MobileFaceNet model loaded from assets/
  - [ ] Model file: mobilefacenet.tflite (INT8 quantized)
  - [ ] Model loaded on app startup
  - [ ] Model cached in memory
- [ ] Inference Setup
  - [ ] TFLite interpreter created
  - [ ] Input buffer allocated (1×112×112×3)
  - [ ] Output buffer allocated (1×128)
  - [ ] GPU acceleration optional (CPU primary)
- [ ] Embedding Generation
  - [ ] Process aligned face (112×112)
  - [ ] Convert to float array [-1, 1]
  - [ ] Run inference (TFLite interpreter)
  - [ ] Normalize output embedding (L2 norm)
  - [ ] Return 128-dim vector
- [ ] Model Tests
  - [ ] Unit test: embedding generation
  - [ ] Verify output is 128-dim float array
  - [ ] Performance test: inference <100ms
  - [ ] Quantization test: compare INT8 vs float32 outputs

### Similarity Comparison Module
- [ ] Cosine Similarity
  - [ ] Calculate dot product of embeddings
  - [ ] Calculate magnitudes
  - [ ] Compute cosine similarity (range: [0, 1])
  - [ ] Confidence score calculation (0-100%)
- [ ] Threshold Tuning
  - [ ] Default threshold: 0.60
  - [ ] Configurable via settings
  - [ ] Threshold adjustment for low-quality images (0.55)
- [ ] Comparison Tests
  - [ ] Unit test: cosine similarity calculation
  - [ ] Test with known pairs (high/low similarity)
  - [ ] Edge cases: identical embeddings, orthogonal vectors
  - [ ] Performance test: comparison <10ms

### Initial Storage (No Encryption Yet)
- [ ] Local storage setup
  - [ ] Files created (face data directory)
  - [ ] Permissions requested (WRITE_EXTERNAL_STORAGE)
- [ ] Data persistence
  - [ ] Embeddings saved to database
  - [ ] Reference images saved to storage
- [ ] Data retrieval
  - [ ] Load embeddings for comparison
  - [ ] Load reference images for display

---

## WEEK 3: Liveness Detection & Attendance Recording

### Blink Detection
- [ ] Eye State Monitoring
  - [ ] Extract eye-open probability from ML Kit
  - [ ] Average left + right eye probabilities
  - [ ] Threshold for "eyes closed": <0.3
- [ ] Blink Event Detection
  - [ ] Track eye state changes (open → closed → open)
  - [ ] Measure closure duration
  - [ ] Validate natural blink (100-300ms)
  - [ ] Count consecutive blinks (require 2)
- [ ] Timeout Management
  - [ ] Max duration for liveness: 5 seconds
  - [ ] If timeout reached → LIVENESS_FAILED
- [ ] Blink Tests
  - [ ] Unit test: blink duration validation
  - [ ] Unit test: blink counting logic
  - [ ] Integration test: real blink detection
  - [ ] Real-world test: photo rejection (no blink)

### Head Movement Detection
- [ ] Facial Landmark Tracking
  - [ ] Extract nose, eyes, chin from landmarks
  - [ ] Calculate face center point
- [ ] Angle Calculation
  - [ ] Calculate yaw angle (horizontal turn)
  - [ ] Calculate pitch angle (vertical tilt)
  - [ ] Calculate roll angle (head rotation)
- [ ] Movement Detection
  - [ ] Compare angles between frames
  - [ ] Require ≥5° movement in yaw or pitch
  - [ ] Track over 5-second window
- [ ] Head Movement Tests
  - [ ] Unit test: angle calculation
  - [ ] Unit test: movement detection logic
  - [ ] Integration test: detect head movements
  - [ ] Real-world test: photo rejection (no movement)

### Combined Liveness Decision
- [ ] Logic Flow
  - [ ] Method 1 (Blink) passes → PASSED
  - [ ] Method 2 (Head movement) passes → PASSED
  - [ ] Both fail + timeout → FAILED
  - [ ] Attempt count tracking (max 3, then lock 30s)
- [ ] User Guidance
  - [ ] Display "Please blink" message
  - [ ] Display "Move head slightly" if blink fails
  - [ ] Audio feedback (beep on success/failure)
- [ ] Liveness Tests
  - [ ] Unit test: combined logic
  - [ ] Spoofing attack test (photo, video)
  - [ ] Real-world test: live face acceptance
  - [ ] Rejection rate target: >96%

### Attendance Recording
- [ ] Database Record Creation
  - [ ] Create Attendance entity:
    - [ ] empId, timestamp, similarity, confidence
    - [ ] locationLat, locationLon, accuracy
    - [ ] deviceModel, osVersion
    - [ ] livenessCheck result
- [ ] Encryption
  - [ ] Encrypt attendance record before storing
  - [ ] Use employee-specific key
- [ ] Sync Queue
  - [ ] Add to pending sync if EDGE offline
  - [ ] Mark for retry
- [ ] Local Summary
  - [ ] Update daily summary (mark present)
  - [ ] Show confirmation UI
- [ ] Attendance Tests
  - [ ] Unit test: attendance record creation
  - [ ] Unit test: database insertion
  - [ ] Integration test: full flow
  - [ ] Test offline recording & sync

### Reference Update (Daily EMA)
- [ ] Update Trigger Check
  - [ ] Attendance marked successfully? ✓
  - [ ] Similarity ≥ threshold? ✓
  - [ ] Already updated today? Skip
- [ ] EMA Calculation
  - [ ] Load current reference embedding
  - [ ] Apply formula: E_new = 0.15 × E_live + 0.85 × E_old
  - [ ] Encrypt new embedding
  - [ ] Store with timestamp
- [ ] Weekly Image Update
  - [ ] Check if 7 days since last image update
  - [ ] Blend: I_new = 0.2 × I_live + 0.8 × I_old
  - [ ] Compress JPEG (quality 85%)
  - [ ] Encrypt and store
- [ ] Update Logging
  - [ ] Log all updates (for audit)
  - [ ] Include timestamps, similarity scores
- [ ] Update Tests
  - [ ] Unit test: EMA calculation
  - [ ] Unit test: image blending
  - [ ] Unit test: date boundary (UTC)
  - [ ] Integration test: full update flow

### Error Handling & Recovery
- [ ] Face Not Detected
  - [ ] Show "No face detected" message
  - [ ] Retry up to 3 times
  - [ ] After 3 failures: Lock 30 seconds
- [ ] Low Similarity
  - [ ] Show confidence score (%)
  - [ ] Show "Face not recognized" message
  - [ ] Offer admin override (if admin user)
- [ ] Liveness Failed
  - [ ] Show specific reason (blink/movement)
  - [ ] Retry up to 3 times
  - [ ] After 3 failures: Lock 30 seconds
- [ ] Network Error
  - [ ] Queue for sync
  - [ ] Show "Attendance marked locally" message
  - [ ] Retry sync when online
- [ ] Error Tests
  - [ ] Test all error cases
  - [ ] Verify user messages clear
  - [ ] Test retry logic
  - [ ] Test lock timeout

---

## WEEK 4: EDGE Integration & Network Communication

### API Client Setup
- [ ] Retrofit Configuration
  - [ ] Base URL: configurable (192.168.x.x:port)
  - [ ] Timeout: 30 seconds (configurable)
  - [ ] Interceptors:
    - [ ] Logging interceptor (DEBUG builds)
    - [ ] Token injection interceptor
    - [ ] Error handling interceptor
- [ ] TLS 1.3 Configuration
  - [ ] SSL/TLS handshake with EDGE
  - [ ] Self-signed certificate support (for local EDGE)
  - [ ] Certificate pinning (for VPS, Phase 3)
- [ ] JSON Serialization
  - [ ] Gson configured
  - [ ] Date/Time formatting configured
  - [ ] Custom serializers for encrypted fields

### Authentication Flow
- [ ] Login Endpoint
  - [ ] POST /api/auth/login
  - [ ] Request: { empId, password, edgeAddress }
  - [ ] Response: { token, role, permissions, employeeData }
- [ ] Token Management
  - [ ] Store JWT in EncryptedSharedPreferences
  - [ ] Add token to request headers
  - [ ] Refresh token logic (if 401)
  - [ ] Logout endpoint: POST /api/auth/logout
- [ ] Authentication Tests
  - [ ] Unit test: request building
  - [ ] Mock test: successful login
  - [ ] Mock test: invalid credentials
  - [ ] Mock test: token refresh

### Employee Data Sync
- [ ] Endpoint: GET /api/employees/{empId}
  - [ ] Fetch employee details
  - [ ] Fetch role (ADMIN/STAFF)
  - [ ] Fetch face photo metadata
- [ ] Face Data Fetching
  - [ ] Endpoint: GET /api/employees/{empId}/face-photos
  - [ ] Download reference face photos
  - [ ] Download face embeddings (encrypted)
- [ ] Local Storage
  - [ ] Cache employee data
  - [ ] Cache face photos locally
  - [ ] Update sync timestamp
- [ ] Employee Tests
  - [ ] Mock API: successful fetch
  - [ ] Mock API: not found (404)
  - [ ] Integration: store in Room DB

### Attendance Sync
- [ ] Sync Queue Manager
  - [ ] Query pending syncs from database
  - [ ] Sort by timestamp
  - [ ] Batch into groups (100 records/batch)
- [ ] Batch Sync Endpoint
  - [ ] POST /api/attendance/batch-sync
  - [ ] Request: { syncs: [{empId, timestamp, location, faceData}] }
  - [ ] Response: { successful, failed }
- [ ] Retry Logic
  - [ ] Max retries: 5
  - [ ] Exponential backoff: 2^n seconds
  - [ ] After max retries: alert admin
- [ ] Sync Confirmation
  - [ ] Mark synced records as synced
  - [ ] Remove from sync queue
  - [ ] Log sync timestamp
- [ ] Sync Tests
  - [ ] Unit test: batch creation
  - [ ] Mock test: successful sync
  - [ ] Mock test: partial failures
  - [ ] Mock test: retry logic

### Network Monitoring
- [ ] Connectivity Detection
  - [ ] Check internet connectivity (ConnectivityManager)
  - [ ] Check EDGE server reachability (ping)
  - [ ] Check VPS connectivity (if enabled)
- [ ] Status Indicators
  - [ ] Update UI with connectivity status
  - [ ] Show EDGE status (Online/Offline)
  - [ ] Show VPS status (Online/Offline)
- [ ] Error Responses
  - [ ] Handle 4xx errors (client errors)
  - [ ] Handle 5xx errors (server errors)
  - [ ] Handle network timeouts
  - [ ] Handle SSL certificate errors
- [ ] Network Tests
  - [ ] Unit test: connectivity check
  - [ ] Integration test: EDGE connection
  - [ ] Mock test: error responses

### Encryption for Network
- [ ] Data Encryption
  - [ ] Encrypt sensitive data before sending
  - [ ] Encrypt response data after receiving
- [ ] TLS 1.3
  - [ ] Verify TLS version requirement
  - [ ] Test with self-signed certificates
- [ ] Certificate Pinning
  - [ ] Prepare for Phase 3 (VPS endpoints)
  - [ ] Pin EDGE certificate (if production)
- [ ] Security Tests
  - [ ] Test data encryption/decryption
  - [ ] Test TLS handshake
  - [ ] Test certificate validation

---

## WEEK 5: User Interfaces & Settings

### Staff Attendance Screen
- [ ] Layout Components
  - [ ] Welcome message (personalized)
  - [ ] Date/time display
  - [ ] System status indicators (EDGE, VPS)
  - [ ] Location display (with accuracy)
  - [ ] Attendance button (large, prominent)
- [ ] Camera Screen (Modal)
  - [ ] Live camera preview
  - [ ] Face detection visual feedback (bounding box)
  - [ ] Processing indicator
  - [ ] Instructions ("Look at camera", "Blink", etc.)
  - [ ] Close button
- [ ] Success Screen
  - [ ] Confirmation message
  - [ ] Attendance details (time, confidence)
  - [ ] Reference photo preview
  - [ ] Button to return home
- [ ] Error Screens
  - [ ] Face not recognized (with retry)
  - [ ] Liveness failed (with retry)
  - [ ] Location out of range (with help)
  - [ ] EDGE offline (with retry)
- [ ] Staff Screen Tests
  - [ ] UI tests: all components visible
  - [ ] UI tests: button clicks work
  - [ ] Navigation tests: transitions smooth
  - [ ] Accessibility tests: proper labels

### Admin Dashboard
- [ ] Dashboard Widgets
  - [ ] System status card (EDGE, VPS, Database)
  - [ ] Quick stats (total employees, present today)
  - [ ] Face enrollment progress
  - [ ] Today's attendance list
  - [ ] Action buttons (quick access)
- [ ] System Status Section
  - [ ] EDGE status: Online/Offline with IP
  - [ ] VPS status: Active/Inactive
  - [ ] Database health: OK/Warning/Error
  - [ ] Backup status: Last backup time
  - [ ] Refresh button
- [ ] Quick Actions
  - [ ] Manage Employees
  - [ ] View Reports
  - [ ] Enroll Face
  - [ ] Settings
  - [ ] Backup Data
  - [ ] APK Status
- [ ] Attendance List (Today)
  - [ ] Employee name, time, status, face confidence
  - [ ] Scroll/pagination
  - [ ] Search/filter
- [ ] Dashboard Tests
  - [ ] UI tests: all widgets load
  - [ ] Data binding tests: correct values
  - [ ] Refresh logic tests

### Employee Management (Admin)
- [ ] Employee List
  - [ ] Display all employees
  - [ ] Search/filter by name/ID
  - [ ] Status indicators (face enrolled, active)
  - [ ] Edit/delete buttons
- [ ] Employee Details
  - [ ] Name, ID, department
  - [ ] Role (ADMIN/STAFF)
  - [ ] Face enrollment status (0-3 photos)
  - [ ] Recent attendance summary
- [ ] Face Enrollment
  - [ ] Angle 1: Front face
  - [ ] Angle 2: Right profile (45°)
  - [ ] Angle 3: Left profile (45°)
  - [ ] Photo quality indicator
  - [ ] Face detection validation
  - [ ] Re-upload option
- [ ] Management Tests
  - [ ] CRUD operations (Create, Read, Update, Delete)
  - [ ] Face enrollment flow
  - [ ] Data validation

### Settings Screen
- [ ] EDGE Settings
  - [ ] Server address (editable)
  - [ ] Test connection button
  - [ ] Connection status
- [ ] Face Recognition Settings
  - [ ] Enable/disable face-based attendance
  - [ ] Similarity threshold (slider: 0.40-0.80)
  - [ ] Liveness timeout (slider: 3-10 seconds)
  - [ ] Appearance change protection level
- [ ] Location Settings
  - [ ] Location permission status
  - [ ] Geofence radius (slider: 25-200m)
  - [ ] Test location button
- [ ] VPS Settings (Phase 2 Preview)
  - [ ] VPS status indicator
  - [ ] Enable VPS switch (disabled in Phase 2)
  - [ ] Pricing plan display
  - [ ] "Coming in Phase 3" message
  - [ ] Contact seller button
- [ ] Security Settings
  - [ ] Biometric unlock (optional)
  - [ ] Session timeout (slider)
  - [ ] Change password button
- [ ] Backup Settings
  - [ ] Last backup time
  - [ ] Manual backup button
  - [ ] Restore backup button
- [ ] About
  - [ ] App version
  - [ ] Build number
  - [ ] License information
- [ ] Settings Tests
  - [ ] Preferences save/load
  - [ ] Threshold validation
  - [ ] Connection testing

### Role-Based Navigation
- [ ] Authentication Check
  - [ ] On app launch, check role
  - [ ] Route to Staff or Admin interface
- [ ] Staff Interface
  - [ ] Bottom navigation: Home, History, Profile, Settings
  - [ ] Home → Attendance screen
  - [ ] History → Recent attendances
  - [ ] Profile → Personal details
  - [ ] Settings → User preferences
- [ ] Admin Interface
  - [ ] Bottom navigation: Dashboard, Employees, Reports, Settings
  - [ ] Dashboard → Admin summary
  - [ ] Employees → Management
  - [ ] Reports → Analytics
  - [ ] Settings → System configuration
- [ ] Navigation Tests
  - [ ] Correct role gets correct UI
  - [ ] Navigation transitions smooth
  - [ ] Back button works correctly

---

## WEEK 6: Security, Encryption & Testing

### Encryption Implementation
- [ ] Android Keystore Setup
  - [ ] Master key generation (first run)
  - [ ] Hardware-backed storage (if available)
  - [ ] Key properties:
    - [ ] Algorithm: AES
    - [ ] Block mode: GCM
    - [ ] Padding: NoPadding
    - [ ] User authentication: Not required (background process)
- [ ] EncryptedSharedPreferences
  - [ ] Store JWT tokens
  - [ ] Store user preferences
  - [ ] Store configuration (thresholds)
- [ ] Database Encryption
  - [ ] SQLCipher integrated
  - [ ] Key derived from master key
  - [ ] Database locked on app exit
- [ ] Face Data Encryption
  - [ ] Embeddings: AES-256-GCM
  - [ ] Reference images: AES-256-GCM
  - [ ] Attendance logs: encrypted in Room DB
  - [ ] IV (initialization vector) randomized per record
- [ ] Encryption Tests
  - [ ] Unit test: key generation
  - [ ] Unit test: encrypt/decrypt
  - [ ] Unit test: key rotation
  - [ ] Integration test: full encryption flow
  - [ ] Security test: no plaintext in database

### Permissions & Privacy
- [ ] Permissions Requested
  - [ ] CAMERA (camera access)
  - [ ] ACCESS_FINE_LOCATION (GPS)
  - [ ] ACCESS_COARSE_LOCATION (network-based)
  - [ ] READ_EXTERNAL_STORAGE (for reference images)
  - [ ] INTERNET (for API communication)
- [ ] Permission Dialogs
  - [ ] First-run permission requests
  - [ ] Clear explanations for each permission
  - [ ] Graceful handling if permission denied
- [ ] Privacy Policy
  - [ ] In-app privacy policy link
  - [ ] Transparent data usage explanation
  - [ ] No cloud upload of face data (except VPS Phase 3)
- [ ] Data Retention
  - [ ] Attendance logs: 24-month default (configurable)
  - [ ] Face data: Until user enrollment deleted
  - [ ] Temporary buffers: Auto-cleared after processing
- [ ] Privacy Tests
  - [ ] Verify no plaintext face data in logs
  - [ ] Verify permission denied handling
  - [ ] Verify data deletion on logout
  - [ ] GDPR compliance checklist

### Geolocation & Validation
- [ ] Location Services
  - [ ] FusedLocationProviderClient setup
  - [ ] Priority: HIGH_ACCURACY
  - [ ] Update interval: 1 second (during attendance)
  - [ ] Min. displacement: 0 (always update)
- [ ] Accuracy Validation
  - [ ] Accuracy threshold: ±50 meters (configurable)
  - [ ] Reject if accuracy worse than threshold
  - [ ] Show accuracy circle on map
- [ ] Geofence Validation
  - [ ] EDGE location: fixed (latitude, longitude)
  - [ ] Allowed radius: 50 meters (configurable)
  - [ ] Check distance before attendance
  - [ ] Reject if too far
  - [ ] Show distance in UI
- [ ] Location Tests
  - [ ] Unit test: distance calculation
  - [ ] Unit test: accuracy validation
  - [ ] Integration test: location retrieval
  - [ ] Real-world test: accuracy in field

### Unit Tests
- [ ] Test Coverage Target: >85%
- [ ] Core Modules (must test)
  - [ ] Face matching logic (25+ tests)
  - [ ] Embedding update (EMA) (20+ tests)
  - [ ] Liveness detection (15+ tests)
  - [ ] Encryption/decryption (18+ tests)
  - [ ] Database operations (22+ tests)
  - [ ] API communication (16+ tests)
  - [ ] Location validation (12+ tests)
  - [ ] Error handling (20+ tests)
- [ ] Test Tools
  - [ ] JUnit 4
  - [ ] Mockito (mocking)
  - [ ] Robolectric (Android testing)
  - [ ] Espresso (UI testing)
- [ ] Test Execution
  - [ ] Run tests locally before commit
  - [ ] CI/CD runs tests on every push
  - [ ] Code coverage report generated
  - [ ] Coverage dashboard visible in CI/CD

### Integration Tests
- [ ] Camera to Detection
  - [ ] Capture frame → Detect face → Crop → Embed
  - [ ] Verify output is 128-dim vector
- [ ] Full Attendance Flow
  - [ ] Login → Camera → Match → Record → Sync
  - [ ] Verify all steps complete
  - [ ] Verify data in database
- [ ] EDGE Integration
  - [ ] Login with EDGE server
  - [ ] Fetch employee data
  - [ ] Sync attendance
  - [ ] Handle offline scenario
- [ ] Offline-to-Online Sync
  - [ ] Mark attendance offline
  - [ ] Queue recorded
  - [ ] Go online
  - [ ] Sync queued records
  - [ ] Verify no data loss

### Real-World Testing Protocol
- [ ] Test Group: 10 staff members
- [ ] Test Duration: 14 days (continuous daily usage)
- [ ] Test Scenarios:
  - [ ] Daily attendance marking (morning + evening)
  - [ ] Appearance changes (beard, glasses, hairstyle)
  - [ ] Lighting variations (office + outdoors)
  - [ ] Time variance (early morning, noon, evening)
  - [ ] Device variance (at least 3 different phones)
- [ ] Success Metrics:
  - [ ] Recognition accuracy: >95%
  - [ ] False positive rate: <1%
  - [ ] Success rate (first attempt): >90%
  - [ ] Average match time: <150ms
  - [ ] User satisfaction: No complaints
- [ ] Data Collection:
  - [ ] Collect all metrics in CSV
  - [ ] Screenshot successes/failures
  - [ ] Video record at least 5 sessions
  - [ ] User feedback questionnaire

### Spoofing Attack Testing
- [ ] Attack Vectors:
  - [ ] Printed photo (same person)
  - [ ] Printed photo (different person)
  - [ ] Video replay (on phone/tablet)
  - [ ] Silicone mask (if available)
  - [ ] Deepfake video (if available)
  - [ ] Twin/similar person (if available)
- [ ] Test Methodology:
  - [ ] 20 attempts per vector
  - [ ] Record pass/fail
  - [ ] Measure detection time
- [ ] Success Criteria:
  - [ ] Rejection rate: >96%
  - [ ] Detection time: <5 seconds
  - [ ] No false positives
- [ ] Deliverable: Spoofing Test Report

### Performance Profiling
- [ ] Profiling Tools:
  - [ ] Android Profiler (CPU, memory, disk, network)
  - [ ] Battery Historian (battery drain)
  - [ ] Logcat (frame drops, warnings)
- [ ] Performance Tests:
  - [ ] Startup time: <3 seconds
  - [ ] Face detection: <50ms
  - [ ] Embedding generation: <100ms
  - [ ] Total match: <300ms (target)
  - [ ] Memory peak: <150MB
  - [ ] Battery per attendance: <5mAh
  - [ ] Disk space: <100MB per 10K records
- [ ] Test Devices:
  - [ ] Pixel 4a (high-end)
  - [ ] Samsung Galaxy A52 (mid-range)
  - [ ] Redmi Note 10 (budget)
  - [ ] OnePlus Nord (high-end)
- [ ] Deliverable: Performance Benchmark Report

---

## WEEK 7: Quality Assurance & Release

### Code Quality
- [ ] Code Review
  - [ ] All code peer-reviewed before merge
  - [ ] GitHub PR checklist verified
  - [ ] No hard-coded values (use constants)
  - [ ] Proper error handling (no crashes)
  - [ ] Logging sufficient (no sensitive data)
- [ ] Static Analysis
  - [ ] Lint warnings: 0 (or approved exceptions)
  - [ ] FindBugs warnings: 0
  - [ ] Null pointer checks complete
  - [ ] Resource cleanup (close streams, cursors)
- [ ] Naming Conventions
  - [ ] Classes: PascalCase
  - [ ] Functions: camelCase
  - [ ] Constants: UPPER_SNAKE_CASE
  - [ ] Private fields: prefix underscore (optional)
- [ ] Documentation
  - [ ] All public methods have Kotlin docs
  - [ ] Complex logic has inline comments
  - [ ] README.md complete
  - [ ] API documentation complete
  - [ ] Security guide complete
- [ ] Code Formatting
  - [ ] Consistent indentation (4 spaces)
  - [ ] Line length: max 120 characters
  - [ ] Organized imports (no unused)
  - [ ] Run Kotlin formatter (ktfmt)

### Build & Optimization
- [ ] Release Build
  - [ ] Clean build from scratch
  - [ ] No build warnings or errors
  - [ ] Proguard/R8 rules applied
  - [ ] Minification working (no crashes)
- [ ] APK Signing
  - [ ] Signing certificate created (if new)
  - [ ] Release keystore secure
  - [ ] APK signed with SHA-256
  - [ ] Signature verified (jarsigner)
- [ ] APK Size
  - [ ] Measure final APK size
  - [ ] Size target: <50MB
  - [ ] Run APK Analyzer
  - [ ] Identify large resources
  - [ ] Compress images (if needed)
- [ ] App Bundle
  - [ ] Create Android App Bundle (.aab)
  - [ ] Size estimate for each device configuration
  - [ ] Download size < 30MB on-demand
- [ ] Resource Optimization
  - [ ] WebP format for images (vs PNG)
  - [ ] Vectorization of simple graphics
  - [ ] Removal of unused resources
  - [ ] String localization ready (english, hindi)

### Security Audit
- [ ] Security Checklist
  - [ ] No plaintext sensitive data in code
  - [ ] No hard-coded API keys/secrets
  - [ ] All API calls use HTTPS (TLS 1.3)
  - [ ] Encryption implemented (AES-256)
  - [ ] Permission usage justified
  - [ ] No external storage for sensitive data
  - [ ] ProGuard obfuscation enabled
  - [ ] Crash reporting respects privacy
- [ ] Dependency Security
  - [ ] Check all dependencies for known vulnerabilities
  - [ ] Use latest stable versions
  - [ ] Update vulnerable dependencies
  - [ ] No GPL licenses (to avoid viral licensing)
- [ ] Code Review (Security)
  - [ ] Expert security review of:
    - [ ] Encryption implementation
    - [ ] API authentication
    - [ ] Data storage
    - [ ] Permissions usage
- [ ] Dynamic Testing
  - [ ] Manual penetration testing
  - [ ] Proxy interception (verify HTTPS)
  - [ ] Database inspection (verify encryption)
  - [ ] Memory dump analysis (no plaintext)
- [ ] Deliverable: Security Audit Report

### Device & OS Testing
- [ ] API Level Coverage
  - [ ] Test on Android 8.0 (API 26) - minimum
  - [ ] Test on Android 10 (API 29)
  - [ ] Test on Android 12 (API 31)
  - [ ] Test on Android 13 (API 33)
  - [ ] Test on Android 14 (API 34) - latest
- [ ] Device Types
  - [ ] Phone (5-inch to 6.5-inch)
  - [ ] Large phone (6.5-inch+)
  - [ ] Tablet (if applicable)
- [ ] Orientations
  - [ ] Portrait mode
  - [ ] Landscape mode
  - [ ] Orientation changes (rotation)
  - [ ] Multi-window (if API 24+)
- [ ] Screen Densities
  - [ ] ldpi, mdpi, hdpi, xhdpi, xxhdpi, xxxhdpi
  - [ ] Verify UI scales correctly
  - [ ] Verify text readable on all sizes
- [ ] Device Tests
  - [ ] Camera quality varies by device (test all)
  - [ ] Performance variance (test on slow device)
  - [ ] Sensor availability (GPS, accelerometer)
  - [ ] Battery states (low battery mode, on charger)
- [ ] Deliverable: Device Compatibility Report

### Documentation Review
- [ ] README.md
  - [ ] Build instructions clear
  - [ ] Dependencies listed
  - [ ] License information
  - [ ] Known issues documented
- [ ] ARCHITECTURE.md
  - [ ] System design explained
  - [ ] Data flow documented
  - [ ] Security architecture clear
  - [ ] Scalability considerations
- [ ] API_INTEGRATION.md
  - [ ] EDGE API endpoints documented
  - [ ] Request/response formats shown
  - [ ] Error codes explained
  - [ ] Example cURL commands
- [ ] FACE_RECOGNITION.md
  - [ ] Algorithm explained
  - [ ] Model details provided
  - [ ] Threshold tuning guidance
  - [ ] Troubleshooting tips
- [ ] SECURITY.md
  - [ ] Encryption methods explained
  - [ ] Key management process
  - [ ] Privacy policy link
  - [ ] Compliance information (GDPR)
- [ ] DEVELOPER_SETUP.md
  - [ ] Environment setup
  - [ ] Project import steps
  - [ ] Running tests
  - [ ] Building APK
  - [ ] Debugging tips

### Version & Release Preparation
- [ ] Version Number
  - [ ] Bump to v2.0.0
  - [ ] Update versionCode in build.gradle
  - [ ] Update versionName
  - [ ] Tag in Git: v2.0.0-release
- [ ] Release Notes
  - [ ] Features added
  - [ ] Bug fixes
  - [ ] Known issues
  - [ ] Breaking changes (if any)
  - [ ] Migration guide (if upgrading)
- [ ] Changelog
  - [ ] CHANGELOG.md updated
  - [ ] Entry for v2.0.0
  - [ ] All commits summarized
- [ ] Communication
  - [ ] Internal team notification
  - [ ] Stakeholder notification
  - [ ] Beta tester communication
  - [ ] User-facing release notes

### Production Release
- [ ] Google Play Console
  - [ ] Account created (or verified)
  - [ ] App profile created
  - [ ] Store listing complete:
    - [ ] Title, description
    - [ ] Screenshots (5+)
    - [ ] Feature graphic
    - [ ] Category: Productivity / Business
    - [ ] Age rating (set to 4+)
    - [ ] Privacy policy link
    - [ ] Permissions justified
- [ ] Release Track
  - [ ] Internal testing track (internal testers only)
  - [ ] Beta track (public, limited users)
  - [ ] Production track (full rollout)
- [ ] Staged Rollout
  - [ ] Day 1: 10% of users
  - [ ] Day 2: 25% of users
  - [ ] Day 3: 50% of users
  - [ ] Day 5: 100% of users
  - [ ] (If no critical issues)
- [ ] Monitoring (Post-Release)
  - [ ] Firebase Crashlytics: Watch for crashes
  - [ ] Google Play Console: Monitor ratings/reviews
  - [ ] Analytics: Track feature usage
  - [ ] Support: Monitor incoming issues
- [ ] Rollback Plan
  - [ ] If critical bug: Immediately pull from Play Store
  - [ ] Notify users via in-app alert
  - [ ] Create hotfix branch (v2.0.1)
  - [ ] Fast-track hotfix testing
  - [ ] Re-release hotfix

### Go-Live Checklist
- [ ] All tests passing: ✅
- [ ] Code review completed: ✅
- [ ] Security audit approved: ✅
- [ ] Documentation complete: ✅
- [ ] Performance meets targets: ✅
- [ ] Real-world testing passed: ✅
- [ ] Spoofing tests passed: ✅
- [ ] Release notes prepared: ✅
- [ ] Team briefed & ready: ✅
- [ ] Monitoring configured: ✅
- [ ] Support team trained: ✅
- [ ] Rollback procedure ready: ✅

**PHASE 2 COMPLETE - READY FOR PRODUCTION DEPLOYMENT**

---

## Success Criteria Summary

| Category | Target | Status |
|----------|--------|--------|
| **Functionality** | All 8 modules working | Week 5 ✅ |
| **Performance** | <300ms match time | Week 3 ✅ |
| **Quality** | >85% code coverage | Week 6 ✅ |
| **Security** | Security audit PASS | Week 7 ✅ |
| **Real-World** | >95% accuracy (14 days) | Week 6 ✅ |
| **Spoofing** | >96% rejection rate | Week 6 ✅ |
| **Documentation** | Complete & reviewed | Week 7 ✅ |
| **Deployment** | Production-ready APK | Week 7 ✅ |

---

**Document End**
Status: READY FOR PHASE 2 IMPLEMENTATION
Date: April 28, 2026
