## Conditional Access Policy anatomy

https://learn.microsoft.com/en-us/entra/identity/conditional-access/overview 

At it's simplest, they are if-then statements

Analyze signals --> Enforce a decision 

## Signals:

WHO does the policy apply to --> Users, Groups, Agents

WHAT are they accessing --> Applications, User Actions, Auth context

WHERE are they accessing it from --> Trusted\untrusted locations. Compliant\Non-compliant devices, Device platforms etc.

Risky behaviour

## Decisions:

Block

Grant

Require additional controls

Apply session controls

Take note of exclusions: Users\Groups, Applications, Devices, Network locations etc

Take note of AND OR Controls and how that can affect your policy results
