import logging
from rest_framework import status
from rest_framework import generics
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from .serializers import User, RegisterSerializer, CustomTokenObtainPairSerializer

logger = logging.getLogger(__name__)


class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = RegisterSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        
        if not serializer.is_valid():
            return Response({
                "error": "Invalid registration data",
                "details": serializer.errors
            }, status=status.HTTP_400_BAD_REQUEST)
            
        try:
            user = serializer.save()
            
            refresh = RefreshToken.for_user(user)
            tokens = {
                "refresh": str(refresh),
                "access": str(refresh.access_token),
            }

            user_data = serializer.data

            return Response({
                "success": True,
                "message": "User registered successfully",
                "data": {
                    "user": user_data,
                    "tokens": tokens
                }
            }, status=status.HTTP_201_CREATED)
            
        except Exception as e:
            logger.error(f"Error during user registration: {str(e)}", exc_info=True)
            return Response({
                "error": "Registration failed",
                "details": "An error occurred during registration"
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer
    
    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        
        try:
            serializer.is_valid(raise_exception=True)
            
            return Response({
                "success": True,
                "message": "Login successful",
                "data": serializer.validated_data
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            logger.error(f"Login failed: {str(e)}")
            return Response({
                "error": "Login failed",
                "details": "Invalid credentials provided"
            }, status=status.HTTP_401_UNAUTHORIZED)