#!/usr/bin/env python3
"""
Comprehensive AI Extraction Test Suite
Tests all edge cases mentioned in the prompt
"""

import json
import requests
import time
from typing import Dict, Any

# API Configuration
API_URL = "https://ltgxvskqotbuclrinhej.supabase.co/functions/v1/ai-extract-event"
API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0Z3h2c2txb3RidWNscmluaGVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEyMjY1NTMsImV4cCI6MjA3NjgwMjU1M30.94ibR92U_ekHBl0BN0w-2eVSGMfPmgEa23AjInBk1hU"

def call_ai_extraction(caption: str, location_hint: str, post_id: str, posted_at: str) -> Dict[str, Any]:
    """Call the AI extraction API"""
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    }

    payload = {
        "caption": caption,
        "locationHint": location_hint,
        "postId": post_id,
        "postedAt": posted_at
    }

    response = requests.post(API_URL, headers=headers, json=payload, timeout=30)
    return response.json()

def run_test(test_id: str, description: str, input_data: Dict, expected: Dict) -> Dict:
    """Run a single test case"""
    print(f"\n{'='*80}")
    print(f"TEST {test_id}: {description}")
    print(f"{'='*80}")

    try:
        result = call_ai_extraction(
            caption=input_data["caption"],
            location_hint=input_data.get("locationHint"),
            post_id=input_data["postId"],
            posted_at=input_data["postedAt"]
        )

        extraction = result.get("extraction", {})

        # Print key results
        print(f"✓ API Call Successful")
        print(f"\nExtracted Data:")
        print(f"  isEvent: {extraction.get('isEvent')}")
        print(f"  eventDate: {extraction.get('eventDate')}")
        print(f"  eventEndDate: {extraction.get('eventEndDate')}")
        print(f"  eventTime: {extraction.get('eventTime')}")
        print(f"  endTime: {extraction.get('endTime')}")
        print(f"  locationName: {extraction.get('locationName')}")
        print(f"  isFree: {extraction.get('isFree')}")
        print(f"  price: {extraction.get('price')}")
        print(f"  priceMin: {extraction.get('priceMin')}")
        print(f"  priceMax: {extraction.get('priceMax')}")
        print(f"  confidence: {extraction.get('confidence')}")
        print(f"  isRecurring: {extraction.get('isRecurring')}")
        print(f"  recurrencePattern: {extraction.get('recurrencePattern')}")
        print(f"  isUpdate: {extraction.get('isUpdate')}")
        print(f"  updateType: {extraction.get('updateType')}")
        print(f"  availabilityStatus: {extraction.get('availabilityStatus')}")
        print(f"  locationStatus: {extraction.get('locationStatus')}")
        print(f"\nReasoning: {extraction.get('reasoning')}")

        # Validate expectations
        print(f"\n{'─'*80}")
        print("Validation:")
        issues = []

        for key, expected_value in expected.items():
            actual_value = extraction.get(key)

            if key == "confidence" and isinstance(expected_value, str):
                # Handle confidence comparisons like ">0.8"
                if expected_value.startswith(">"):
                    threshold = float(expected_value[1:])
                    if actual_value and actual_value > threshold:
                        print(f"  ✓ {key}: {actual_value} (expected {expected_value})")
                    else:
                        print(f"  ✗ {key}: {actual_value} (expected {expected_value})")
                        issues.append(f"{key} validation failed")
                elif expected_value.startswith("<"):
                    threshold = float(expected_value[1:])
                    if actual_value and actual_value < threshold:
                        print(f"  ✓ {key}: {actual_value} (expected {expected_value})")
                    else:
                        print(f"  ✗ {key}: {actual_value} (expected {expected_value})")
                        issues.append(f"{key} validation failed")
            elif key == "reasoning_contains":
                if expected_value.lower() in extraction.get('reasoning', '').lower():
                    print(f"  ✓ reasoning contains '{expected_value}'")
                else:
                    print(f"  ✗ reasoning does NOT contain '{expected_value}'")
                    issues.append(f"Reasoning missing expected text")
            else:
                if actual_value == expected_value:
                    print(f"  ✓ {key}: {actual_value}")
                else:
                    print(f"  ✗ {key}: {actual_value} (expected {expected_value})")
                    issues.append(f"{key} mismatch")

        status = "PASS" if len(issues) == 0 else "FAIL"
        print(f"\nStatus: {status}")
        if issues:
            print(f"Issues: {', '.join(issues)}")

        return {
            "test_id": test_id,
            "status": status,
            "issues": issues,
            "extraction": extraction
        }

    except Exception as e:
        print(f"✗ Test Failed: {str(e)}")
        return {
            "test_id": test_id,
            "status": "ERROR",
            "issues": [str(e)],
            "extraction": None
        }

def main():
    """Run all tests"""
    tests = [
        {
            "id": "01",
            "description": "Recurring Event - Every Friday",
            "input": {
                "caption": "FREAKY FRIDAY Every Friday night at XX XX! Resident DJs spinning the best tracks. 10PM onwards. 500 presale / 800 door",
                "locationHint": "XX XX Makati",
                "postId": "test-recurring-01",
                "postedAt": "2025-12-17T10:00:00+00:00"
            },
            "expected": {
                "isEvent": True,
                "isRecurring": True,
                "eventTime": "22:00:00",
                "confidence": ">0.75"
            }
        },
        {
            "id": "02",
            "description": "Multi-day Event - Date Range",
            "input": {
                "caption": "WEEKEND FESTIVAL! December 12-13, 2025 at SM Mall of Asia Concert Grounds. Two days of music, art, and fun! 1500 weekend pass",
                "locationHint": "SM Mall of Asia",
                "postId": "test-multiday-01",
                "postedAt": "2025-12-10T08:00:00+00:00"
            },
            "expected": {
                "isEvent": True,
                "eventDate": "2025-12-12",
                "eventEndDate": "2025-12-13",
                "isRecurring": False
            }
        },
        {
            "id": "03",
            "description": "Midnight Crossing Event",
            "input": {
                "caption": "ALL NIGHTER! December 20, 10PM - 4AM. The party continues till sunrise! 600 entrance",
                "locationHint": "Poblacion Social Club",
                "postId": "test-midnight-01",
                "postedAt": "2025-12-15T08:00:00+00:00"
            },
            "expected": {
                "isEvent": True,
                "eventDate": "2025-12-20",
                "eventTime": "22:00:00",
                "endTime": "04:00:00",
                "eventEndDate": "2025-12-21"
            }
        },
        {
            "id": "04",
            "description": "Operating Hours - NOT AN EVENT",
            "input": {
                "caption": "We're open! 6PM — Tuesdays to Saturdays. Come visit us for drinks and good vibes!",
                "locationHint": "The Backroom",
                "postId": "test-notevent-01",
                "postedAt": "2025-12-17T08:00:00+00:00"
            },
            "expected": {
                "isEvent": False,
                "confidence": "<0.6"
            }
        },
        {
            "id": "05",
            "description": "Past Event Throwback",
            "input": {
                "caption": "What an amazing night last Saturday! Thanks everyone who came out. Can't wait for the next one!",
                "locationHint": "XX XX",
                "postId": "test-past-01",
                "postedAt": "2025-12-17T08:00:00+00:00"
            },
            "expected": {
                "isEvent": False,
                "confidence": "<0.5"
            }
        },
        {
            "id": "06",
            "description": "Relative Date - Tomorrow",
            "input": {
                "caption": "TOMORROW NIGHT! DJ set starting 9PM. Be there! 400 entrance",
                "locationHint": "The Grid",
                "postId": "test-relative-01",
                "postedAt": "2025-12-17T10:00:00+00:00"
            },
            "expected": {
                "isEvent": True,
                "eventDate": "2025-12-18",
                "eventTime": "21:00:00"
            }
        },
        {
            "id": "07",
            "description": "Free Event",
            "input": {
                "caption": "FREE ADMISSION! December 25, Christmas Party at The Park. No cover charge. Everyone welcome!",
                "locationHint": "The Park",
                "postId": "test-price-01",
                "postedAt": "2025-12-15T08:00:00+00:00"
            },
            "expected": {
                "isEvent": True,
                "isFree": True,
                "price": None,
                "eventDate": "2025-12-25"
            }
        },
        {
            "id": "08",
            "description": "Price Range - Presale/Door",
            "input": {
                "caption": "NEW YEAR'S EVE BASH! Dec 31. 800 presale / 1200 door. Get tickets now!",
                "locationHint": "Valkyrie Nightclub",
                "postId": "test-price-02",
                "postedAt": "2025-12-15T08:00:00+00:00"
            },
            "expected": {
                "isEvent": True,
                "isFree": False,
                "eventDate": "2025-12-31"
            }
        },
        {
            "id": "09",
            "description": "Sold Out Status",
            "input": {
                "caption": "SOLD OUT! December 20 concert at Smart Araneta. Join the waitlist for cancellations.",
                "locationHint": "Smart Araneta Coliseum",
                "postId": "test-status-01",
                "postedAt": "2025-12-15T08:00:00+00:00"
            },
            "expected": {
                "isEvent": True,
                "availabilityStatus": "sold_out",
                "eventDate": "2025-12-20"
            }
        },
        {
            "id": "10",
            "description": "No Date - Should Reject",
            "input": {
                "caption": "BIG ANNOUNCEMENT! Amazing lineup coming to Philippine Arena. Tickets on sale soon!",
                "locationHint": "Philippine Arena",
                "postId": "test-missing-01",
                "postedAt": "2025-12-17T08:00:00+00:00"
            },
            "expected": {
                "isEvent": False,
                "eventDate": None,
                "confidence": "<0.6"
            }
        }
    ]

    results = []
    passed = 0
    failed = 0

    print("\n" + "="*80)
    print("AI EXTRACTION COMPREHENSIVE TEST SUITE")
    print("="*80)
    print(f"Running {len(tests)} tests...")

    for test in tests:
        result = run_test(
            test_id=test["id"],
            description=test["description"],
            input_data=test["input"],
            expected=test["expected"]
        )
        results.append(result)

        if result["status"] == "PASS":
            passed += 1
        else:
            failed += 1

        time.sleep(1)  # Rate limiting

    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    print(f"Total Tests: {len(tests)}")
    print(f"Passed: {passed}")
    print(f"Failed: {failed}")
    print(f"Success Rate: {(passed/len(tests)*100):.1f}%")

    # Failed tests detail
    if failed > 0:
        print(f"\n{'─'*80}")
        print("FAILED TESTS:")
        for result in results:
            if result["status"] != "PASS":
                print(f"\n  Test {result['test_id']}: {result.get('issues', [])}")

    # Save results
    with open('test-results.json', 'w') as f:
        json.dump(results, f, indent=2)
    print(f"\nDetailed results saved to: test-results.json")

if __name__ == "__main__":
    main()
