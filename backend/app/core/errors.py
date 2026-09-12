class AppError(Exception):
    """Base exception for application errors."""

class ValidationError(AppError):
    """Raised when application-level validation fails."""

class LLMValidationFailed(AppError):
    """Raised when LLM output validation fails"""
    
class FileTooLarge(AppError):
    """Raised when a file exceeds max file size limit."""
    
class UnsupportedFileType(AppError):
    """Raised when file is unsupported """

class ProcessingError(AppError):
    """Raised when document processing fails."""

class NotFoundError(AppError):
    """Raised when a requested source does not exist."""