from django.test import TestCase
from rest_framework.test import APIClient


class AuthFlowTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def register(self, **overrides):
        payload = {"username": "alice", "email": "alice@example.com",
                   "password": "Zq8#mLw2vTp9", "confirm_password": "Zq8#mLw2vTp9", **overrides}
        return self.client.post("/api/v1/account/register/", payload, format="json")

    def test_register_login_and_use_token(self):
        self.assertEqual(self.register().status_code, 201)

        response = self.client.post("/api/v1/account/login/",
                                    {"username": "alice", "password": "Zq8#mLw2vTp9"}, format="json")
        self.assertEqual(response.status_code, 200)
        tokens = response.json()["data"]["tokens"]

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")
        self.assertEqual(self.client.get("/api/v1/documents/").status_code, 200)

        refreshed = APIClient().post("/api/v1/account/token/refresh/", {"refresh": tokens["refresh"]}, format="json")
        self.assertIn("access", refreshed.json())

    def test_password_mismatch(self):
        response = self.register(confirm_password="different-pass-1")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"], "Invalid registration data")

    def test_bad_login(self):
        response = self.client.post("/api/v1/account/login/", {"username": "x", "password": "y"}, format="json")
        self.assertEqual(response.status_code, 401)
