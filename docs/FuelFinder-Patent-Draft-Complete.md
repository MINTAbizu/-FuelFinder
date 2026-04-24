# FuelFinder Patent Document
// mulugeta commercial  22 orial beatkrystan 
//  oromial 
## 1. Administrative Information

Name of innovator: `Mintsenot Bizuayehw`

Title of innovation: `FuelFinder: A Vehicle-Energy Station Discovery, Queue Reservation, Payment, and Secure Check-In Coordination System`

Address of innovator: `______________________________`

Contact phone number: `______________________________`

Applicant or assignee, if different from innovator: `______________________________`

Jurisdiction or filing office: `______________________________`

## 2. Abstract

FuelFinder is a computer-implemented vehicle-energy access coordination system that helps users discover fuel stations and electric charging stations, evaluate live service conditions, reserve queue positions remotely, complete digital payment, receive real-time alerts, and perform secure arrival verification at a station. The system combines a customer mobile application, back-end coordination services, station-side operational tools, and an administrative management platform. The innovation reduces wasted travel, physical crowding, uncertainty, and service disorder by integrating geolocation-based station discovery, queue-state management, payment-linked reservation activation, QR and OTP-based check-in validation, and operator-side control in one unified workflow. The system is particularly adapted for environments in which fuel availability, queue pressure, and station readiness change rapidly, and it is further localized for Ethiopian operating conditions through support for local payments, local administrative geography, and multilingual use.

## 3. Background

In many urban and high-demand service environments, access to fuel is limited not only by supply but also by the lack of timely, reliable, and actionable information. Drivers often travel to multiple stations without knowing whether a station is open, whether fuel is available, how long the queue is, or whether the time and cost of reaching the station will be worthwhile. This creates wasted travel, additional fuel consumption, road congestion, long physical waiting lines, and dissatisfaction for both customers and station operators.

Traditional solutions usually address only isolated parts of this broader problem. Some applications show station locations. Some systems support navigation. Some services support payment. Some stations handle queues manually. However, these fragmented approaches do not provide a unified system that coordinates discovery, service-state visibility, reservation, payment, arrival validation, and station operations together.

FuelFinder was conceived to solve this coordination gap. The innovation treats fuel and EV station access as a combined information, queue-management, transaction, and operational-control problem. The platform connects customers, station staff, station managers, and administrators through one integrated workflow.

The original goal of the project was not simply to build another map application. The deeper goal was to reduce uncertainty in fuel access by giving users timely, location-aware, and operationally useful information. Instead of forcing people to rely on rumors, phone calls, physical observation, or trial-and-error travel, FuelFinder provides a digital way to discover stations, evaluate station conditions, and make better decisions before committing to a trip.

From the user perspective, the platform is intended to answer practical questions such as:

- Which station near me has fuel?
- How far away is it?
- What is the queue situation there?
- What fuel type is available?
- Can I reserve a place before I arrive?
- Can I pay in advance and reduce waiting time?
- How do I get there quickly and confirm my turn when I arrive?

The same operational uncertainty exists for electric charging access. EV users need more than a map location. They also need charger readiness information, route practicality, availability visibility, and confidence that stopping at a location will be worthwhile. For that reason, FuelFinder expanded beyond conventional fuel discovery and now supports both fuel stations and electric charging stations within one broader station-access platform.

FuelFinder is therefore larger than a traditional station directory. A normal directory may list names and coordinates, but it does not solve the operational problem of vehicle-energy access under pressure. FuelFinder addresses that broader problem by combining discovery, queue handling, real-time updates, payments, and check-in into one coordinated flow.

The background of the platform is rooted in the everyday inefficiencies that appear when fuel access is uncertain. In many real-world situations, customers may drive from station to station only to discover that a station is out of stock, temporarily inactive, overcrowded, or serving a fuel type they do not need. This wastes time, increases fuel consumption, causes frustration, and reduces trust in station information. At the same time, station staff may be forced to manage heavy queues manually while also answering repeated questions from customers about stock levels, expected waiting times, and payment procedures.

FuelFinder addresses this problem by treating vehicle-energy access as an information and coordination challenge. The platform recognizes that the main pain point is not only the physical lack of fuel or charging availability, but also the lack of reliable visibility around availability, queue movement, and station readiness. By improving visibility, the platform helps users plan better, reduces unnecessary travel, supports orderly service, and makes the overall station experience more predictable.

## 4. Prior Art

Existing and prior solutions generally have one or more of the following limitations:

- they provide station location without reliable live queue-state visibility;
- they provide navigation without reservation-linked service coordination;
- they provide digital payment without queue-state activation or station verification;
- they lack secure customer-arrival confirmation at the station;
- they do not connect customer-facing data with station-side operational control;
- they do not integrate fuel and EV charging service access in one system;
- they lack strong localization for Ethiopian payment behavior, administrative geography, and service conditions; and
- they do not provide a coordinated digital ticket workflow using both QR and OTP validation.

FuelFinder improves over such prior approaches by combining location-aware discovery, dynamic station information, queue reservation, payment verification, notification, station check-in, and operator management into one continuous platform.

## 5. Field of the Innovation

The present innovation generally relates to digital mobility-service platforms, location-aware station-discovery systems, queue-management systems, payment-enabled service coordination systems, and secure arrival-verification systems. More particularly, the innovation relates to a mobile and server-based platform for discovering fuel stations and electric charging stations, remotely coordinating queue participation, processing payment-linked reservations, delivering alerts, and verifying customer arrival at a station through QR code and OTP-based validation.

## 6. Need for Innovation

Fuel distribution in many urban areas, particularly in Ethiopia, is characterized by long queues, limited real-time information, inefficient service processes, and congestion at fuel stations. Users are often required to physically visit stations without knowing whether fuel is available, how long the queue is, or whether the waiting time is reasonable.

This creates several practical problems:

- time loss and operational inefficiency;
- traffic congestion around stations and road networks;
- unnecessary fuel wastage caused by repeated travel; and
- poor user experience caused by uncertainty and lack of trusted information.

Existing solutions provide only limited capabilities, such as station-location lookup, basic navigation, or digital payment. However, those systems usually do not provide real-time fuel availability alerts, remote queue reservation, customer-arrival notification to stations, integrated queue-payment communication, secure QR or OTP-based validation, or localization for Ethiopian fuel-distribution challenges.

The innovation responds to these gaps by introducing the following practical improvements:

- real-time queue monitoring and waiting-time estimation;
- remote queue reservation without physical presence at the station;
- integration of advanced digital payment systems;
- generation of secure digital tickets using QR code and OTP;
- GPS-based station discovery with navigation support;
- fuel-availability alerts for nearby stations;
- customer notifications when a turn is approaching; and
- a centralized digital platform connecting users and stations in real time.

These improvements significantly enhance efficiency, communication, transparency, and user convenience while supporting more orderly station operations.

## 7. Objective of the Innovation

The primary objective of the innovation is to provide an intelligent, integrated, and localized digital system that improves access to vehicle-energy services by reducing uncertainty, congestion, waiting time, and inefficient station visits while improving station-side operational coordination.

Additional objectives include:

- to provide trustworthy station information before a user travels;
- to enable nearby discovery of fuel stations and electric charging stations;
- to provide live or near-live visibility into queue status, fuel or charging status, and route practicality;
- to support remote queue reservation without immediate physical presence at the station;
- to integrate digital payment into the reservation and activation workflow;
- to generate secure digital tickets tied to reservation records;
- to validate station arrival using QR and OTP-based check-in mechanisms;
- to alert customers when fuel is available nearby or when queue conditions change;
- to enable station staff and managers to control queues, station status, and service data;
- to provide administrative oversight across users, stations, payments, and locations; and
- to localize the system for Ethiopian use through support for local payment gateways, local administrative geography, and multilingual user interaction.

## 8. Description

### 8.1 Brief Description of the Figures

Figure 1. Overall system architecture of the FuelFinder platform showing the customer mobile application, owner or admin web portal, backend services, data stores, and external integrations.

Figure 2. Use-case diagram showing the interactions between customers, station staff, station owners or admins, super admins, and external providers.

Figure 3. Authentication and account lifecycle flow sheet showing session restoration, registration, login, verification, password reset, biometric login, and token refresh behavior.

Figure 4. Data-flow diagram showing movement of user, station, queue, payment, and notification data through core backend processes and data stores.

Figure 5. Payment orchestration flow showing Chapa and Telebirr payment paths and activation of a paid queue ticket.

Figure 6. Queue-ticket state-transition diagram showing progression among pending payment, waiting, called, served, cancelled, and expired states under payment, operator, cancellation, and timeout conditions.

Figure 7. Station check-in and verification flow showing check-in initiation, geofence validation, OTP and QR generation, staff verification, and queue update emission.

### 8.2 Figure Element Reference Guide

#### Figure 1 Reference Numerals

- `101` customer mobile application;
- `102` owner or admin web portal;
- `103` on-device runtime services;
- `104` offline cache and local persistence;
- `105` location, biometric, and notification device services;
- `106` backend application programming interface;
- `107` authentication and authorization middleware;
- `108` queue, payment, map, and notification application services;
- `109` real-time communication gateway;
- `110` database and persistent data layer;
- `111` map and geolocation services;
- `112` payment gateway integrations;
- `113` push notification and messaging services.

#### Figure 2 Reference Numerals

- `201` customer actor;
- `202` station staff actor;
- `203` station owner or admin actor;
- `204` super admin actor;
- `205` payment gateway actor;
- `206` map or location-service actor;
- `207` account registration and verification use case;
- `208` station discovery use case;
- `209` route and station-detail use case;
- `210` queue reservation use case;
- `211` payment use case;
- `212` station check-in use case;
- `213` alert and notification use case;
- `214` queue-management use case;
- `215` station-management and reporting use case.

#### Figure 3 Reference Numerals

- `301` app launch and session-restore process;
- `302` login or registration selection;
- `303` account registration request;
- `304` phone verification process;
- `305` password login process;
- `306` Google or federated sign-in process;
- `307` biometric login process;
- `308` two-factor verification process;
- `309` password-reset process;
- `310` token refresh and session continuation process.

#### Figure 4 Reference Numerals

- `401` customer mobile app input flow;
- `402` owner or admin web portal input flow;
- `403` station staff or manager input flow;
- `404` authentication and identity process;
- `405` station discovery and routing process;
- `406` queue and check-in management process;
- `407` payment orchestration process;
- `408` station operations and administrative control process;
- `409` real-time alert and notification process;
- `410` user and session data store;
- `411` station and location data store;
- `412` queue-ticket data store;
- `413` payment-transaction data store;
- `414` operational metadata store;
- `415` map and geolocation external service;
- `416` identity verification external service;
- `417` payment-gateway external service;
- `418` push and SMS external service.

#### Figure 5 Reference Numerals

- `501` Chapa payment initialization step;
- `502` Chapa hosted checkout step;
- `503` Chapa callback handling step;
- `504` Chapa payment verification step;
- `505` queue-ticket activation after successful Chapa payment;
- `506` Telebirr initiation step;
- `507` Telebirr token and pre-order generation step;
- `508` Telebirr webhook handling step;
- `509` queue-ticket activation after successful Telebirr payment;
- `510` common paid-ticket waiting-state outcome.

#### Figure 6 Reference Numerals

- `601` pending-payment queue state;
- `602` waiting queue state;
- `603` called queue state;
- `604` served terminal state;
- `605` cancelled terminal state;
- `606` expired terminal state;
- `607` payment timeout rule;
- `608` waiting timeout rule;
- `609` called or no-show timeout rule.

#### Figure 7 Reference Numerals

- `701` active eligible ticket;
- `702` check-in start request from user;
- `703` ticket ownership and eligibility validation;
- `704` geofence and location-accuracy validation;
- `705` check-in session creation;
- `706` OTP and QR generation;
- `707` queue-ticket update to arrival state;
- `708` customer presentation of OTP or QR proof;
- `709` station-side proof submission;
- `710` proof verification and session validation;
- `711` queue-ticket update to verified state;
- `712` real-time queue update emission.

### 8.3 Detailed Description of the Innovation

#### 8.3.1 Overall System

As shown in Figure 1, the innovation is a coordinated digital system `100` comprising a customer mobile application `101`, an owner or administrative web portal `102`, on-device support services `103`, a back-end service layer `106`, a real-time communication gateway `109`, a persistent data layer `110`, and one or more external integrations including map services `111`, payment gateways `112`, and notification services `113`.

The customer mobile application `101` is the primary user-facing interface. It allows a user to register, authenticate, discover nearby stations, view service conditions, reserve queue positions, make payment, track queue status, receive notifications, and perform station check-in. The owner or administrative web portal `102` enables operational users to manage stations, queue flow, stock data, payment review, staff access, and administrative records.

The back-end service layer `106` receives requests from the mobile and web clients and applies business logic through application services `108`, protected by authentication and authorization middleware `107`. The back end communicates with a persistent data layer `110`, which stores user accounts, station records, queue tickets, payment transactions, location records, promotions, audit logs, and related metadata. The real-time gateway `109` distributes updates such as queue changes, ticket-calling events, and station fuel updates.

#### 8.3.2 User Roles and Functional Scope

As shown in Figure 2, the system supports several actors. A customer `201` uses the system for registration `207`, station discovery `208`, route review `209`, queue reservation `210`, payment `211`, station check-in `212`, and alerts `213`. Station staff `202` and station owners or admins `203` use the system for queue handling `214`, station management `215`, payment review, and service validation. A super admin `204` manages broader platform-level resources and permissions. External providers such as map services `206` and payment gateways `205` support geolocation and payment operations.

This multi-role arrangement is significant because the innovation is not limited to a static discovery application. It coordinates both customer-side and station-side activity so that the information visible to customers is connected to real station operations.

#### 8.3.3 Authentication and Identity Management

As shown in Figure 3, the authentication portion of the innovation is preferably illustrated as a patent-style flow sheet in which app launch and session restoration process `301` begins when the mobile application is opened. In one embodiment, locally stored session data including an access token, a refresh token, and user-session metadata are inspected at process `301`. If valid session data are present, the backend attempts to rehydrate the session by retrieving profile data and, where needed, refreshing the token pair. If restoration succeeds, the user is returned directly to an authenticated application state. If restoration fails, expires, or is unavailable, control moves to login or registration selection `302`.

At selection process `302`, the user may choose an account-creation path or one of several sign-in paths. In a first path, account registration request `303` receives account information such as name, email address, phone number, and password. In one embodiment, the backend creates a customer account record and then initiates phone verification process `304`. Phone verification process `304` may include issuance of a temporary verification token, generation of a one-time passcode, transmission of the passcode by SMS or a similar messaging service, receipt of a user-entered code at the client, and verification of the code at the backend before an authenticated session is granted. In some embodiments, an email verification link may also be issued as part of the same registration lifecycle while phone verification remains the gating step for entry into the authenticated application state.

In a second path, password login process `305` receives user credentials and submits them to the backend for account lookup and password validation. If the account has not yet completed phone verification, the system may redirect from password login process `305` to phone verification process `304` before issuing session credentials. If the account has completed phone verification but has two-factor protection enabled, the system may redirect from password login process `305` to two-factor verification process `308`. Otherwise, the backend issues an access token and refresh token and establishes the authenticated session.

In a third path, Google or federated sign-in process `306` receives a federated identity token from an external identity provider and validates that token through a backend verification operation. In one embodiment, a matching local account is identified or a new local account record is created from the federated identity payload. If the resulting account still requires phone verification, control moves to phone verification process `304`. If the account has two-factor protection enabled, control moves to two-factor verification process `308`. If no additional verification is required, the system issues authenticated session credentials and transitions the user into the authenticated portion of the platform.

In a fourth path, biometric login process `307` may be used after a device-specific biometric secret has previously been registered to the account. In one embodiment, the client retrieves a device identifier and stored biometric credential, prompts the device operating environment for biometric confirmation, and submits the resulting device identifier and secret to the backend. If the backend validates the registered biometric credential, the user session is restored without re-entry of the account password. This path is particularly useful for repeated access to a platform that manages reservations, payments, and time-sensitive queue actions.

Two-factor verification process `308` may be triggered after password login process `305` or federated sign-in process `306` where the account is configured for an additional security factor. In one embodiment, process `308` generates a short-lived security code, transmits that code to a verified user phone number, receives the user-entered code through the client, validates the code at the backend, and, upon success, issues session credentials. If the code expires or the maximum number of attempts is exceeded, the system may require code reissuance before completion of authentication.

Password-reset process `309` supports account recovery. In one embodiment, the user submits an email address associated with the account, the backend identifies a verified phone number for that account, generates a temporary reset verification token and one-time passcode, and transmits the passcode to the verified phone number. After successful verification of the passcode, the system permits submission of a replacement password and invalidates previous recovery data. This arrangement reduces unauthorized account takeover while preserving recoverability for legitimate users.

Token refresh and session continuation process `310` maintains continuity of the authenticated session after initial login. In one embodiment, when a protected backend request fails due to expiration of the access token, the client submits the refresh token to obtain a replacement token pair without requiring full reauthentication. If refresh succeeds, the original protected request may be retried. If refresh fails, the local session is cleared and control returns to login or registration selection `302`. In this manner, process `310` improves continuity while still preserving revocation and expiration controls.

In one embodiment, successful completion of processes `304`, `305`, `306`, `307`, or `308` may also lead to a post-authentication user-state decision, such as prompting a customer account to select a preferred station-discovery mode before the main application interface is shown. The authentication flow of Figure 3 therefore serves not only as a login mechanism, but also as a controlled entry gate into the broader station-discovery, queue-reservation, payment, and check-in functions of the platform.

This identity flow improves security, recoverability, and operational reliability in a system that handles queue positions, payment-linked tickets, and station-side operational actions.

#### 8.3.4 Station Discovery and Service Visibility

As shown in Figures 1 and 4, the customer mobile application `101` and data-flow process `405` obtain nearby station information using geolocation and external map services `111` and `415`. The system may search for nearby fuel stations or electric charging stations, retrieve route-related information, and display station-specific attributes such as service status, queue state, distance, availability, and related operational details.

The station and location data store `411` maintains station coordinates, regional and city information, inventory or service status records, and related data used to support localized discovery. The map process allows the user to decide whether traveling to a particular station is worthwhile before physically moving to the location.

#### 8.3.5 Queue Reservation and Queue-State Management

As shown in Figures 4 and 6, queue-management process `406` preferably operates according to a defined queue-ticket state model in which each ticket progresses through one of several controlled digital states. In one embodiment, creation of a reservation causes the queue ticket to enter pending-payment state `601`. State `601` is suitable for reservations that require a deposit or advance payment before the ticket becomes active in the service queue. Upon successful payment confirmation, the queue ticket transitions from pending-payment state `601` to waiting state `602`, thereby becoming an active place in the queue.

In another embodiment, the system may support a direct-join path in which a ticket is created directly in waiting state `602` without first entering pending-payment state `601`, for example where no advance deposit is required. Waiting state `602` represents an active but not yet called ticket having a queue position among other active waiting tickets. The queue position may be recalculated as tickets are added, cancelled, expired, or advanced.

When a station operator advances service, the next eligible ticket in waiting state `602` may transition to called state `603`. In one embodiment, transition to called state `603` also records a called timestamp, resets call-notification metadata, and starts a limited response window for customer arrival. If a previously called ticket remains active when the operator advances the queue again, that earlier called ticket may be transitioned to served state `604` before the next waiting ticket is called.

Served state `604` is a terminal fulfillment state indicating that the customer has completed the queue service cycle. Cancelled state `605` is a terminal termination state indicating voluntary or permitted exit from the queue. In one embodiment, cancellation may occur from pending-payment state `601`, waiting state `602`, or called state `603`. If a deposit has already been authorized, cancellation may further trigger a refund or reversal operation according to system policy. Expired state `606` is a terminal timeout state used where the customer does not complete the required action within the allowed time for the current active state.

The state model of Figure 6 is governed by defined timeout and transition rules. In one implementation supported by the current system, pending-payment state `601` is controlled by a payment window rule `607` of approximately ten minutes. If the required payment is not completed within that window, the queue ticket transitions from pending-payment state `601` to expired state `606`. Waiting state `602` is controlled by a waiting window rule `608` of approximately one hundred twenty minutes, or another configured value, after which the queue ticket may transition to expired state `606` if not otherwise advanced or cancelled. Called state `603` is controlled by a called or no-show window rule `609` of approximately five minutes, after which the ticket may transition to expired state `606` if the customer does not arrive or complete the expected action within the call window.

In one embodiment, expiration from called state `603` may also cause a payment-related consequence, such as deposit forfeiture, while expiration from pending-payment state `601` may simply terminate the reservation before activation. In another embodiment, cancellation of a ticket from waiting state `602` or called state `603` may also trigger restoration of reserved fuel quantity or similar station-capacity metadata so that station-side operational data remain synchronized with queue-state changes.

The queue-ticket data store `412` maintains reservation status, queue position, timing metadata, payment references, payment-status metadata, and check-in state information associated with each queue ticket. This state-driven architecture reduces queue disorder, enables predictable automation, and creates a consistent digital service flow suitable for fuel-station and electric-charging coordination.

#### 8.3.6 Digital Payment Integration

As shown in Figure 5, the innovation supports at least two payment paths. In a first embodiment, Chapa payment flow includes initialization `501`, customer checkout `502`, callback handling `503`, payment verification `504`, and queue-ticket activation `505`. In a second embodiment, Telebirr flow includes initiation `506`, token or pre-order generation `507`, webhook handling `508`, and queue-ticket activation `509`. Both flows lead to a common paid-ticket waiting state `510`.

In one implementation, a reservation remains in the pending-payment state until a payment provider confirms success. Once confirmed, the system updates payment-transaction records, associates payment references with the queue ticket, activates the queue ticket, and may adjust station fuel inventory or related operational counters. This payment-linked activation reduces abuse of queue reservations and improves transaction traceability.

#### 8.3.7 Station Check-In and Secure Arrival Verification

As shown in Figure 7, a user with an active eligible ticket `701` initiates a check-in start request `702`. The backend validates ticket ownership and eligibility `703`, then performs geofence and location-accuracy validation `704`. In one implementation supported by the current system, the user must be within approximately two hundred fifty meters of the station and have sufficient location accuracy, for example within approximately one hundred twenty meters, before a valid session is created.

After validation, the system creates a check-in session `705`, generates secure OTP and QR proof `706`, and stores arrival-state information in the queue ticket `707`. The customer presents the OTP or QR proof `708` to station staff. Station staff submit the proof for validation `709`, after which the system verifies the submitted proof and session status `710`. If successful, the queue ticket is updated to a verified state `711`, and a queue update is emitted `712` so that connected clients reflect the change.

In one implementation supported by the current system, the check-in OTP has a limited lifetime of approximately three hundred seconds and may enforce a maximum number of attempts before requiring a session restart. These controls make the arrival-verification step more secure and reduce misuse of old or copied reservation proofs.

#### 8.3.8 Real-Time Alerts and Notifications

As shown in Figures 1 and 4, the real-time gateway `109` and notification process `409` communicate queue and station changes to users and operators. Alerts may include queue-updated events, ticket-called events, station fuel updates, and customer notifications indicating that a turn is approaching or that service conditions have changed.

The notification services `113` and `418` may include push notifications, SMS, or similar delivery methods. By distributing updates quickly, the system avoids the limitations of static station-listing applications and supports active service coordination.

#### 8.3.9 Station Operations and Administrative Control

As shown in Figures 1, 2, and 4, the owner or admin portal `102`, actors `202` through `204`, and operations process `408` allow authorized users to update station records, maintain fuel or charger status, manage team access, review payments, supervise queue activity, manage promotions, and maintain location directory data.

This operational layer is important because customer-visible service data must be supported by station-side control. The innovation therefore includes role-based access and scoped permissions so that different operators can perform different actions according to responsibility and station assignment.

#### 8.3.10 Electric-Vehicle Support

The innovation is not limited to conventional fuel stations. In one embodiment, the same discovery, queue, payment, notification, and coordination logic is extended to electric charging stations. A user may search for a charging location, view availability or readiness information, evaluate route practicality, and use the same coordinated platform to make a service decision.

This extension broadens the innovation into a vehicle-energy access platform rather than a fuel-only application, while preserving the same underlying coordination method.

#### 8.3.11 Localization and Practical Deployment Context

The system is particularly suited for Ethiopian operating conditions. Localization may include support for Ethiopian languages, Ethiopian regions, cities, and woredas, local currency and local payment behavior, and payment-gateway integrations such as Chapa and Telebirr. However, the innovation is not limited to Ethiopia and may be adapted to other geographic regions while retaining the same underlying concept.

#### 8.3.12 Innovative Contribution

The innovative contribution of FuelFinder is not any single isolated feature taken alone. Rather, the innovative contribution lies in the integrated coordination of the following elements in one system:

- geolocation-based station discovery;
- live service-state visibility;
- remote queue reservation;
- payment-linked ticket activation;
- secure check-in using both QR and OTP;
- real-time communication between customer and station-side interfaces; and
- operator-side control connected to what users see in the client application.

This integrated arrangement produces a practical, scalable, and localized service-coordination platform that reduces uncertainty and improves both customer and station operations.

## 9. Claims

1. A computer-implemented vehicle-energy station discovery and service-coordination system, comprising:
   a customer mobile application configured to authenticate a user account, receive location input, identify nearby fuel stations and electric charging stations, present dynamic station information, receive a queue-reservation request, receive digital payment input, present queue status and notification events, and present secure arrival-verification proof to the user;
   a backend coordination server communicatively coupled to the customer mobile application and configured to manage user data, station data, queue-ticket states, payment-linked reservation activation, secure check-in sessions, and real-time update events;
   an operator interface configured for station staff, station managers, or administrative users to update station conditions, manage queue progression, review payments, and validate customer arrival;
   a persistent data store configured to maintain user records, station records, queue-ticket records, payment-transaction records, and operational metadata; and
   one or more external service integrations comprising map or geolocation services, payment-gateway services, and notification-delivery services;
   wherein the backend coordination server is configured to coordinate location-based station discovery, queue reservation, payment verification, queue-state transitions, real-time notifications, secure arrival validation, and station-side operational control in a unified workflow for both fuel services and electric charging services.

2. The system of claim 1, wherein the dynamic station information includes at least station availability, fuel type or charging-service information, queue status, estimated waiting condition, route-related information, and nearby station alerts derived from geolocation data.

3. The system of claim 1, wherein the backend coordination server is configured to create a queue ticket in response to the queue-reservation request, assign the queue ticket to a pending-payment state, receive payment confirmation from at least one external payment gateway, and in response to the payment confirmation transition the queue ticket to an active waiting state, the queue ticket further being selectively transitionable among called, served, cancelled, and expired states according to defined business rules.

4. The system of claim 1, wherein the backend coordination server is configured to create a secure check-in session for a selected station only after validating ticket eligibility and user location relative to the selected station, and to generate secure arrival-verification proof comprising both a machine-readable code and a one-time code associated with the secure check-in session.

5. The system of claim 4, wherein the operator interface is configured to permit authorized station-side personnel to submit the machine-readable code or the one-time code for verification, and wherein the backend coordination server is configured to verify the submitted proof against an active secure check-in session, update the queue ticket to a verified state, emit a real-time queue update, and enforce role-based permissions for management of station availability, fuel inventory or charger status, team access, and payment review.

6. A computer-implemented method for coordinating access to a fuel station or electric charging station, comprising:
   authenticating, by a mobile application and a backend coordination server, a user account associated with a user device;
   receiving, by the mobile application, location input associated with the user device;
   retrieving, by the backend coordination server, nearby station data for one or more fuel stations or electric charging stations;
   presenting, by the mobile application, dynamic station information comprising at least availability information and queue-related information for a selected station;
   receiving, by the mobile application, a queue reservation request for the selected station;
   creating, by the backend coordination server, a queue ticket associated with the queue reservation request and placing the queue ticket in a pending-payment state;
   receiving payment confirmation from an external payment service;
   transitioning, by the backend coordination server, the queue ticket to an active waiting state responsive to the payment confirmation;
   transmitting real-time notifications relating to queue movement, station-status change, nearby availability, or approach of the user's turn;
   validating user proximity relative to the selected station when the user approaches the selected station;
   generating secure check-in proof comprising a machine-readable code and a one-time code tied to a current secure check-in session; and
   verifying the secure check-in proof through a station-side interface before confirming arrival of the user.

7. A non-transitory computer-readable medium storing instructions that, when executed by one or more processors, cause the one or more processors to perform the method of claim 6.

## 10. Figure Captions

Figure 1. System architecture of a vehicle-energy station discovery and service-coordination platform according to one embodiment of the innovation.

Figure 2. Use-case interactions among customer, station staff, station owner or admin, super admin, payment gateway, and location service according to one embodiment of the innovation.

Figure 3. Authentication, verification, and session-lifecycle flow sheet according to one embodiment of the innovation.

Figure 4. Data-flow architecture for identity, station discovery, queue management, payment orchestration, and notification handling according to one embodiment of the innovation.

Figure 5. Payment orchestration workflow for multiple payment providers and queue-ticket activation according to one embodiment of the innovation.

Figure 6. Queue-ticket state-transition diagram according to one embodiment of the innovation.

Figure 7. Geofenced station check-in and secure QR or OTP validation workflow according to one embodiment of the innovation.
